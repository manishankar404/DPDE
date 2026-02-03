// Decrypts an AES-256-GCM encrypted Blob using Web Crypto API
// encryptedBlob: Blob (from IPFS)
// key: Array<number> (raw AES key bytes)
// iv: Array<number> (IV bytes)
// Returns: Promise<Blob> (decrypted file)
export async function decryptBlob(encryptedBlob, key, iv) {
  // Read encrypted data as ArrayBuffer
  const encryptedArrayBuffer = await encryptedBlob.arrayBuffer();

  // Import the AES-GCM key
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Decrypt
  let decryptedArrayBuffer;
  try {
    decryptedArrayBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      cryptoKey,
      encryptedArrayBuffer
    );
  } catch (e) {
    throw new Error('Decryption failed: ' + e.message);
  }

  // Return as Blob
  return new Blob([decryptedArrayBuffer]);
}
