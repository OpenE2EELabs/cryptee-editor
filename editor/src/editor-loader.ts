import { decryptFile, encryptFile } from "./crypto";
import {
  appendSessionChange,
  createOfficeSession,
  OFFICE_SESSION_CONTENT_TYPE,
  OOXML_CONTENT_TYPE,
  serializeOfficeSession,
  tryParseOfficeSession,
  updateSessionCheckpoint,
  type OfficeSession,
} from "./office-session";
import { CryptPadOnlyOfficeAdapter } from "./onlyoffice-adapter";
import type {
  EditorAdapter,
  EditorConfig,
  FileType,
  SaveResult,
} from "./types";
import { convertBinToOoxml, convertOoxmlToBin } from "./x2t-converter";

export class EditorRuntime {
  constructor(
    private readonly config: EditorConfig,
    private readonly adapter: EditorAdapter = new CryptPadOnlyOfficeAdapter({
      fileType: config.fileType,
      mode: config.mode,
      title: config.displayName ?? "Untitled",
      userId: config.userId,
      userDisplayName: config.userDisplayName,
    }),
    private readonly onStatus: (message: string) => void = () => undefined,
  ) {}

  private session: OfficeSession | undefined;

  async load(container: HTMLElement): Promise<void> {
    this.report("Fetching encrypted file...");
    const response = await withTimeout(
      fetch(this.config.fileUrl),
      60_000,
      "Timed out while fetching encrypted file",
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
      "Timed out while decrypting file",
    );

    const existingSession = tryParseOfficeSession(plaintext);
    const internalBytes = existingSession
      ? this.openExistingSession(existingSession)
      : await this.importOoxmlToSession(plaintext);

    this.report("Starting ONLYOFFICE editor...");
    await withTimeout(
      this.adapter.mount(container, internalBytes),
      300_000,
      "Timed out while starting ONLYOFFICE editor",
    );

    this.adapter.setMode(this.config.mode);
    if (this.config.displayName) {
      this.adapter.setDisplayName(this.config.displayName);
    }
    this.report("Editor ready");
  }

  async save(): Promise<SaveResult> {
    const internalBytes = await this.adapter.exportDocument();
    this.session = updateSessionCheckpoint(
      this.requireSession(),
      internalBytes,
    );
    const sessionBytes = serializeOfficeSession(this.session);
    const encrypted = await encryptFile(sessionBytes, this.config.fileKey);

    if (this.config.saveUrl) {
      const upload = await fetch(this.config.saveUrl, {
        method: "PUT",
        headers: { "Content-Type": OFFICE_SESSION_CONTENT_TYPE },
        body: encrypted,
      });
      if (!upload.ok) {
        throw new Error(`Save upload failed with status ${upload.status}`);
      }
    }

    return {
      encryptedBytes: encrypted,
      contentType: OFFICE_SESSION_CONTENT_TYPE,
      documentFormat: "cryptee-office-session-v1",
    };
  }

  async exportOoxml(
    fileType: FileType = this.config.fileType,
  ): Promise<SaveResult> {
    if (fileType !== this.config.fileType) {
      throw new Error(
        `Export to ${fileType} is not supported for ${this.config.fileType} sessions`,
      );
    }
    const internalBytes = await this.adapter.exportDocument();
    const ooxml = await convertInternalToOoxml(internalBytes, fileType);
    const encrypted = await encryptFile(ooxml, this.config.fileKey);
    return {
      encryptedBytes: encrypted,
      contentType: OOXML_CONTENT_TYPE,
      documentFormat: "ooxml",
    };
  }

  getAdapter(): EditorAdapter {
    return this.adapter;
  }

  recordLocalPatch(patch: ArrayBuffer): void {
    this.session = appendSessionChange(this.requireSession(), patch);
  }

  private report(message: string): void {
    this.onStatus(message);
  }

  private openExistingSession(session: OfficeSession): ArrayBuffer {
    if (session.fileType !== this.config.fileType) {
      throw new Error(
        `Session fileType ${session.fileType} does not match requested ${this.config.fileType}`,
      );
    }
    this.report("Opening encrypted Office session...");
    this.session = session;
    return session.editorBin.slice(0);
  }

  private async importOoxmlToSession(
    plaintext: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    this.report(
      `Converting ${this.config.fileType.toUpperCase()} to ONLYOFFICE session format...`,
    );
    const internalBytes = await withTimeout(
      convertOoxmlToInternal(plaintext, this.config.fileType),
      600_000,
      `Timed out while converting ${this.config.fileType.toUpperCase()}; this can happen with very large files or if x2t.wasm cannot initialize in the browser`,
    );
    this.session = createOfficeSession(
      this.config.fileType,
      internalBytes,
      this.config.displayName,
    );
    return internalBytes;
  }

  private requireSession(): OfficeSession {
    if (!this.session) {
      throw new Error("Office session has not been initialized");
    }
    return this.session;
  }
}

async function convertOoxmlToInternal(
  bytes: ArrayBuffer,
  fileType: string,
): Promise<ArrayBuffer> {
  await ensureVendorPresent("x2t");
  return convertOoxmlToBin(bytes, fileType as FileType);
}

async function convertInternalToOoxml(
  bytes: ArrayBuffer,
  fileType: string,
): Promise<ArrayBuffer> {
  await ensureVendorPresent("x2t");
  return convertBinToOoxml(bytes, fileType as FileType);
}

async function ensureVendorPresent(
  name: "x2t" | "onlyoffice-editor",
): Promise<void> {
  const probe =
    name === "x2t"
      ? "./vendor/x2t/cryptee-vendor-ready.txt"
      : "./vendor/onlyoffice-editor/cryptee-vendor-ready.txt";
  const response = await fetch(probe, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(
      `Missing vendor artifact ${name}; run scripts/fetch-vendor.sh`,
    );
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(message)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
