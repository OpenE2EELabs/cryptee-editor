import { decryptFile, encryptFile } from "./crypto";
import { CryptPadOnlyOfficeAdapter } from "./onlyoffice-adapter";
import type { EditorAdapter, EditorConfig, FileType } from "./types";
import { convertBinToOoxml, convertOoxmlToBin } from "./x2t-converter";

export class EditorRuntime {
  constructor(
    private readonly config: EditorConfig,
    private readonly adapter: EditorAdapter = new CryptPadOnlyOfficeAdapter({
      fileType: config.fileType,
      mode: config.mode,
      title: config.displayName ?? "Untitled",
      userId: config.userId,
      userDisplayName: config.userDisplayName
    })
  ) {}

  async load(container: HTMLElement): Promise<void> {
    const response = await fetch(this.config.fileUrl);
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    const encrypted = await response.arrayBuffer();
    const plaintext = await decryptFile(encrypted, this.config.fileKey);
    const internalBytes = await convertOoxmlToInternal(plaintext, this.config.fileType);
    await this.adapter.mount(container, internalBytes);
    this.adapter.setMode(this.config.mode);
    if (this.config.displayName) {
      this.adapter.setDisplayName(this.config.displayName);
    }
  }

  async save(): Promise<ArrayBuffer> {
    const internalBytes = await this.adapter.exportDocument();
    const ooxml = await convertInternalToOoxml(internalBytes, this.config.fileType);
    const encrypted = await encryptFile(ooxml, this.config.fileKey);

    if (this.config.saveUrl) {
      const upload = await fetch(this.config.saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: encrypted
      });
      if (!upload.ok) {
        throw new Error(`Save upload failed with status ${upload.status}`);
      }
    }

    return encrypted;
  }

  getAdapter(): EditorAdapter {
    return this.adapter;
  }
}

async function convertOoxmlToInternal(bytes: ArrayBuffer, fileType: string): Promise<ArrayBuffer> {
  await ensureVendorPresent("x2t");
  return convertOoxmlToBin(bytes, fileType as FileType);
}

async function convertInternalToOoxml(bytes: ArrayBuffer, fileType: string): Promise<ArrayBuffer> {
  await ensureVendorPresent("x2t");
  return convertBinToOoxml(bytes, fileType as FileType);
}

async function ensureVendorPresent(name: "x2t" | "onlyoffice-editor"): Promise<void> {
  const probe =
    name === "x2t"
      ? "./vendor/x2t/cryptee-vendor-ready.txt"
      : "./vendor/onlyoffice-editor/cryptee-vendor-ready.txt";
  const response = await fetch(probe, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`Missing vendor artifact ${name}; run scripts/fetch-vendor.sh`);
  }
}
