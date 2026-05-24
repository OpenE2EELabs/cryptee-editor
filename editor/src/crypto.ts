const NONCE_BYTES = 12;
const AES_KEY_BYTES = 32;

export function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function decryptFile(encryptedBytes: ArrayBuffer, keyBase64: string): Promise<ArrayBuffer> {
  const encrypted = new Uint8Array(encryptedBytes);
  if (encrypted.byteLength <= NONCE_BYTES) {
    throw new Error("encrypted file is too short");
  }
  const key = await importAesKey(keyBase64);
  const nonce = encrypted.slice(0, NONCE_BYTES);
  const ciphertext = encrypted.slice(NONCE_BYTES);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, ciphertext);
}

export async function encryptFile(plaintext: ArrayBuffer, keyBase64: string): Promise<ArrayBuffer> {
  const key = await importAesKey(keyBase64);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, plaintext)
  );
  const out = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.byteLength);
  return out.buffer;
}

export async function deriveSessionKey(sessionId: string, fileKey: string): Promise<CryptoKey> {
  const inputKeyMaterial = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(fileKey),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(sessionId),
      info: new TextEncoder().encode("cryptee-editor chainpad session v1")
    },
    inputKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function importAesKey(keyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(keyBase64);
  if (keyBytes.byteLength !== AES_KEY_BYTES) {
    throw new Error("fileKey must decode to 32 bytes");
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

