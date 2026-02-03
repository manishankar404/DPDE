export async function encryptFile(file) {
  console.log("Generating AES-GCM key...");
  const data = await file.arrayBuffer();
  console.log("File data loaded:", data.byteLength, "bytes");

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  console.log("Key generated");

  const iv = crypto.getRandomValues(new Uint8Array(12));
  console.log("IV generated:", iv.length, "bytes");

  console.log("Encrypting data...");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  console.log("Data encrypted:", encrypted.byteLength, "bytes");

  console.log("Exporting key...");
  const exportedKey = await crypto.subtle.exportKey("raw", key);
  console.log("Key exported");

  return {
    encryptedBlob: new Blob([encrypted]),
    key: Array.from(new Uint8Array(exportedKey)),
    iv: Array.from(iv),
  };
}
