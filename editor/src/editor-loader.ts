import { decryptFile, encryptFile } from "./crypto";
import type { EditorAdapter, EditorConfig } from "./types";

export class EditorRuntime {
  constructor(
    private readonly config: EditorConfig,
    private readonly adapter: EditorAdapter = new PlaceholderOnlyOfficeAdapter()
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
  void fileType;
  return bytes;
}

async function convertInternalToOoxml(bytes: ArrayBuffer, fileType: string): Promise<ArrayBuffer> {
  await ensureVendorPresent("x2t");
  void fileType;
  return bytes;
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

class PlaceholderOnlyOfficeAdapter implements EditorAdapter {
  private bytes = new ArrayBuffer(0);
  private saveHandler: (() => void) | undefined;

  async mount(container: HTMLElement, documentBytes: ArrayBuffer): Promise<void> {
    await ensureVendorPresent("onlyoffice-editor");
    this.bytes = documentBytes.slice(0);
    container.innerHTML = `
      <div class="placeholder-editor" contenteditable="true" role="textbox" aria-label="Document editor">
        <p>ONLYOFFICE vendor assets are present. The upstream adapter boundary is ready for the CryptPad editor runtime.</p>
      </div>
    `;
  }

  async exportDocument(): Promise<ArrayBuffer> {
    return this.bytes.slice(0);
  }

  setMode(mode: "edit" | "view"): void {
    const editable = mode === "edit";
    document.querySelector(".placeholder-editor")?.setAttribute("contenteditable", String(editable));
  }

  setDisplayName(): void {}

  applyRemotePatch(): void {}

  onLocalPatch(): void {}

  onSaveRequest(handler: () => void): void {
    this.saveHandler = handler;
  }

  requestSave(): void {
    this.saveHandler?.();
  }
}
