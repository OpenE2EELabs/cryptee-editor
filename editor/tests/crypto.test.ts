import { describe, expect, it } from "vitest";
import { bytesToBase64, decryptFile, encryptFile } from "../src/crypto";

describe("crypto", () => {
  it("roundtrips AES-256-GCM encrypted files", async () => {
    const key = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    const plaintext = new TextEncoder().encode("hello encrypted office").buffer;
    const encrypted = await encryptFile(plaintext, key);
    const decrypted = await decryptFile(encrypted, key);
    expect(new TextDecoder().decode(decrypted)).toBe("hello encrypted office");
  });

  it("rejects keys that are not AES-256 length", async () => {
    const key = bytesToBase64(new Uint8Array(16));
    await expect(encryptFile(new ArrayBuffer(1), key)).rejects.toThrow("32 bytes");
  });

  it("decrypts a known AES-GCM empty-message vector", async () => {
    const key = bytesToBase64(new Uint8Array(32));
    const nonce = new Uint8Array(12);
    const tag = Uint8Array.from([
      0x53, 0x0f, 0x8a, 0xfb, 0xc7, 0x45, 0x36, 0xb9, 0xa9, 0x63, 0xb4, 0xf1, 0xc4, 0xcb, 0x73, 0x8b
    ]);
    const encrypted = new Uint8Array(nonce.length + tag.length);
    encrypted.set(nonce);
    encrypted.set(tag, nonce.length);
    const decrypted = await decryptFile(encrypted.buffer, key);
    expect(decrypted.byteLength).toBe(0);
  });
});
