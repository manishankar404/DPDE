import { Web3Storage } from "web3.storage";

console.log("Initializing Web3Storage...");
const token = import.meta.env.VITE_WEB3_TOKEN;
console.log("Token present:", !!token);

const client = new Web3Storage({
  token: token,
});

export async function uploadToIPFS(blob) {
  console.log("Creating file from blob...");
  const file = new File([blob], "encrypted-file");
  console.log("File created:", file.name, file.size, "bytes");

  console.log("Uploading to Web3Storage...");
  try {
    const cid = await client.put([file]);
    console.log("Successfully uploaded! CID:", cid);
    return cid;
  } catch (error) {
    console.error("Upload error:", error.message);
    throw error;
  }
}
