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
    }),
    private readonly onStatus: (message: string) => void = () => undefined
  ) {}

  async load(container: HTMLElement): Promise<void> {
    this.report("Fetching encrypted file...");
    const response = await withTimeout(
      fetch(this.config.fileUrl),
      60_000,
      "Timed out while fetching encrypted file"
    );
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    this.report("Reading encrypted bytes...");
    const encrypted = await response.arrayBuffer();

    this.report("Decrypting file...");
    const plaintext = await withTimeout(
      decryptFile(encrypted, this.config.fileKey),
      30_000,
      "Timed out while decrypting file"
    );

    this.report(`Converting ${this.config.fileType.toUpperCase()} to ONLYOFFICE format...`);
    const internalBytes = await withTimeout(
      convertOoxmlToInternal(plaintext, this.config.fileType),
      600_000,
      `Timed out while converting ${this.config.fileType.toUpperCase()}; this can happen with very large files or if x2t.wasm cannot initialize in the browser`
    );

    this.report("Starting ONLYOFFICE editor...");
    await withTimeout(
      this.adapter.mount(container, internalBytes),
      300_000,
      "Timed out while starting ONLYOFFICE editor"
    );

    this.adapter.setMode(this.config.mode);
    if (this.config.displayName) {
      this.adapter.setDisplayName(this.config.displayName);
    }
    this.report("Editor ready");
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

  private report(message: string): void {
    this.onStatus(message);
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
