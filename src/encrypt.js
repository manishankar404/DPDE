export async function encryptFile(file) {
  const data = await file.arrayBuffer();

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const exportedKey = await crypto.subtle.exportKey("raw", key);

  return {
    encryptedBlob: new Blob([encrypted]),
    key: Array.from(new Uint8Array(exportedKey)),
    iv: Array.from(iv),
  };
}
