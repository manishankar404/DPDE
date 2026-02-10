import { useState, useEffect } from "react";
import { encryptFile } from "./encrypt";
import { uploadToIPFS } from "./upload";
import { decryptBlob } from "./decrypt";
import {
  grantAccess,
  checkAccess,
  getCurrentWalletAddress,
} from "./blockchain/consent";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // Sepolia chainId (hex)

function App() {
  const [wallet, setWallet] = useState(null);
  const [networkOk, setNetworkOk] = useState(false);
  const [cid, setCid] = useState("");
  const [secret, setSecret] = useState(null);
  const [status, setStatus] = useState("");

  // ---------------- WALLET & NETWORK SETUP ----------------
  useEffect(() => {
    async function connectWallet() {
      try {
        if (!window.ethereum) {
          setStatus("MetaMask not found.");
          return;
        }

        const address = await getCurrentWalletAddress();
        setWallet(address);

        const chainId = await window.ethereum.request({
          method: "eth_chainId",
        });

        if (chainId !== SEPOLIA_CHAIN_ID) {
          setNetworkOk(false);
          setStatus("Please switch MetaMask to Sepolia network.");
        } else {
          setNetworkOk(true);
          setStatus("");
        }
      } catch (err) {
        setStatus("Wallet connection failed: " + err.message);
      }
    }

    connectWallet();

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", connectWallet);
      window.ethereum.on("chainChanged", connectWallet);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners("accountsChanged");
        window.ethereum.removeAllListeners("chainChanged");
      }
    };
  }, []);

  // ---------------- PATIENT FLOW ----------------
  async function handleUpload(e) {
    try {
      const file = e.target.files[0];
      if (!file) return;

      setStatus("Encrypting file...");
      const encrypted = await encryptFile(file);

      setStatus("Uploading encrypted file to IPFS...");
      const cid = await uploadToIPFS(encrypted.encryptedBlob);

      setCid(cid);
      setSecret({
                  key: encrypted.key,
                  iv: encrypted.iv,
                  name: file.name,
                  type: file.type,
                });

      setStatus("Granting blockchain consent...");
      await grantAccess(wallet, cid);

      setStatus("Consent granted. CID & key can now be shared securely.");
    } catch (error) {
      console.error(error);
      setStatus("Error: " + error.message);
    }
  }

  // ---------------- PROVIDER FLOW ----------------
  async function handleProviderAccess() {
    try {
      if (!cid || !secret) {
        setStatus("CID or decryption data missing.");
        return;
      }

      setStatus("Checking blockchain consent...");
      const hasAccess = await checkAccess(wallet, cid);

      if (!hasAccess) {
        setStatus("Consent not granted. Access denied.");
        alert("You do not have consent to access this file.");
        return;
      }

      setStatus("Fetching encrypted file from IPFS...");
      const res = await fetch(`https://w3s.link/ipfs/${cid}`);
      if (!res.ok) throw new Error("Failed to fetch encrypted file");

      const encryptedBlob = await res.blob();

      setStatus("Decrypting file...");
      const decryptedBlob = new Blob([await decryptBlob(
                                          encryptedBlob,
                                          secret.key,
                                          secret.iv
                                        ).then(b => b.arrayBuffer())
                                      ],
                                      { type: secret.type }
                                    );

      setStatus("Downloading decrypted file...");
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = secret.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus("Decryption and download complete.");
    } catch (error) {
      console.error(error);
      setStatus("Error: " + error.message);
    }
  }

  // ---------------- UI ----------------
  return (
    <div style={{ padding: 20 }}>
      <h2>DPDE Consent-Driven Secure Data Exchange</h2>

      <div>
        <strong>Wallet:</strong>{" "}
        {wallet ? wallet : <span style={{ color: "red" }}>Not connected</span>}
      </div>

      <div>
        <strong>Network:</strong>{" "}
        {networkOk ? "Sepolia" : <span style={{ color: "red" }}>Wrong network</span>}
      </div>

      <hr />

      <h3>Patient: Upload & Grant Consent</h3>
      <input
        type="file"
        onChange={handleUpload}
        disabled={!wallet || !networkOk}
      />

      {cid && secret && (
        <>
          <p>
            <strong>CID:</strong> {cid}
          </p>
          <pre>{JSON.stringify(secret, null, 2)}</pre>
        </>
      )}

      <hr />

      <h3>Provider: Access & Decrypt</h3>
      <button
        onClick={handleProviderAccess}
        disabled={!wallet || !networkOk || !cid || !secret}
      >
        Check Consent & Download Decrypted File
      </button>

      {status && <p>{status}</p>}
    </div>
  );
}

export default App;