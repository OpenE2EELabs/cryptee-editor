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
      0x58, 0xe2, 0xfc, 0xce, 0xfa, 0x7e, 0x30, 0x61, 0x36, 0x7f, 0x1d, 0x57, 0xa4, 0xe7, 0x45, 0x5a
    ]);
    const encrypted = new Uint8Array(nonce.length + tag.length);
    encrypted.set(nonce);
    encrypted.set(tag, nonce.length);
    const decrypted = await decryptFile(encrypted.buffer, key);
    expect(decrypted.byteLength).toBe(0);
  });
});
