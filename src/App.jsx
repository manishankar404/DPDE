import { useState } from "react";
import { encryptFile } from "./encrypt";
import { uploadToIPFS } from "./upload";

function App() {
  const [cid, setCid] = useState(null);
  const [secret, setSecret] = useState(null);

  async function handleUpload(e) {
    try {
      const file = e.target.files[0];
      console.log("File selected:", file.name, file.size, "bytes");

      console.log("Starting encryption...");
      const encrypted = await encryptFile(file);
      console.log("Encryption complete:", {
        encryptedSize: encrypted.encryptedBlob.size,
        keyLength: encrypted.key.length,
        ivLength: encrypted.iv.length,
      });

      console.log("Uploading to IPFS...");
      const cid = await uploadToIPFS(encrypted.encryptedBlob);
      console.log("Upload complete! CID:", cid);

      setCid(cid);
      setSecret({
        key: encrypted.key,
        iv: encrypted.iv,
      });
      console.log("State updated successfully");
    } catch (error) {
      console.error("Error occurred:", error);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Encrypted IPFS Upload</h2>

      <input type="file" onChange={handleUpload} />

      {cid && (
        <>
          <p><strong>CID:</strong> {cid}</p>
          <pre>{JSON.stringify(secret, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export default App;
