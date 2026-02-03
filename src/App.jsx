import { useState } from "react";
import { encryptFile } from "./encrypt";
import { uploadToIPFS } from "./upload";
import { decryptBlob } from "./decrypt";

function App() {
  const [cid, setCid] = useState(null);
  const [secret, setSecret] = useState(null);
  const [status, setStatus] = useState("");

  async function handleUpload(e) {
    try {
      setStatus("Encrypting file...");
      const file = e.target.files[0];
      const encrypted = await encryptFile(file);
      setStatus("Uploading encrypted file to IPFS...");
      const cid = await uploadToIPFS(encrypted.encryptedBlob);
      setCid(cid);
      setSecret({ key: encrypted.key, iv: encrypted.iv });
      setStatus("Fetching encrypted file from IPFS...");
      // Fetch encrypted blob from IPFS public gateway
      const url = `https://w3s.link/ipfs/${cid}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch from IPFS");
      const encryptedBlob = await res.blob();
      setStatus("Decrypting file...");
      // Decrypt
      const decryptedBlob = await decryptBlob(
        encryptedBlob,
        encrypted.key,
        encrypted.iv
      );
      setStatus("Triggering download of decrypted file...");
      // Download
      const urlObj = URL.createObjectURL(decryptedBlob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = file.name.replace(/(\.[^.]+)?$/, "_decrypted$1");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
      setStatus("Decryption and download complete!");
    } catch (error) {
      setStatus("Error: " + error.message);
      console.error("Error occurred:", error);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Encrypted IPFS Upload & Automated Decrypt</h2>
      <input type="file" onChange={handleUpload} />
      {cid && (
        <>
          <p><strong>CID:</strong> {cid}</p>
          <pre>{JSON.stringify(secret, null, 2)}</pre>
        </>
      )}
      {status && <p>{status}</p>}
    </div>
  );
}

export default App;
