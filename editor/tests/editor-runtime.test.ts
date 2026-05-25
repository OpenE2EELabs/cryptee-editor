import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptFile, encryptFile } from "../src/crypto";
import { EditorRuntime } from "../src/editor-loader";
import {
  createOfficeSession,
  OFFICE_SESSION_CONTENT_TYPE,
  OOXML_CONTENT_TYPE,
  serializeOfficeSession,
  tryParseOfficeSession,
} from "../src/office-session";
import type { EditorAdapter, EditorConfig } from "../src/types";

vi.mock("../src/x2t-converter", () => ({
  convertBinToOoxml: vi.fn(async (bytes: ArrayBuffer, fileType: string) => {
    const text = new TextDecoder().decode(bytes);
    return new TextEncoder().encode(`${fileType}:${text}`).buffer;
  }),
  convertOoxmlToInternalDocument: vi.fn(async (bytes: ArrayBuffer) => ({
    bytes,
    media: [],
  })),
}));

const fileKey = bytesToBase64(new Uint8Array(32).fill(7));

describe("EditorRuntime storage contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the active editable object as an encrypted office session", async () => {
    const adapter = new MemoryAdapter(
      new TextEncoder().encode("updated checkpoint").buffer,
    );
    const upload = vi.fn(async () => response(204));
    const config = configFor({ saveUrl: "https://storage.example/doc.enc" });
    vi.stubGlobal("fetch", makeFetch(await encryptedSession("docx"), upload));

    const runtime = new EditorRuntime(config, adapter);
    await runtime.load({} as HTMLElement);
    const result = await runtime.save();

    expect(result.contentType).toBe(OFFICE_SESSION_CONTENT_TYPE);
    expect(result.documentFormat).toBe("cryptee-office-session-v1");
    expect(upload).toHaveBeenCalledWith(
      "https://storage.example/doc.enc",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": OFFICE_SESSION_CONTENT_TYPE },
      }),
    );

    const plaintext = await decryptFile(result.encryptedBytes, fileKey);
    const parsed = tryParseOfficeSession(plaintext);
    expect(new TextDecoder().decode(parsed?.editorBin)).toBe(
      "updated checkpoint",
    );
  });

  it("exports encrypted OOXML only when the parent explicitly requests export", async () => {
    const adapter = new MemoryAdapter(
      new TextEncoder().encode("export checkpoint").buffer,
    );
    const upload = vi.fn(async () => response(204));
    const config = configFor({ saveUrl: "https://storage.example/doc.enc" });
    vi.stubGlobal("fetch", makeFetch(await encryptedSession("docx"), upload));

    const runtime = new EditorRuntime(config, adapter);
    await runtime.load({} as HTMLElement);
    const result = await runtime.exportOoxml("docx");

    expect(result.contentType).toBe(OOXML_CONTENT_TYPE);
    expect(result.documentFormat).toBe("ooxml");
    expect(upload).not.toHaveBeenCalled();

    const plaintext = await decryptFile(result.encryptedBytes, fileKey);
    expect(new TextDecoder().decode(plaintext)).toBe("docx:export checkpoint");
  });
});

class MemoryAdapter implements EditorAdapter {
  constructor(private readonly exported: ArrayBuffer) {}

  async mount() {
    return undefined;
  }

  async exportDocument() {
    return this.exported.slice(0);
  }

  setMode() {
    return undefined;
  }

  setDisplayName() {
    return undefined;
  }

  applyRemotePatch() {
    return undefined;
  }

  onLocalPatch() {
    return undefined;
  }

  onSaveRequest() {
    return undefined;
  }
}

function configFor(overrides: Partial<EditorConfig> = {}): EditorConfig {
  return {
    fileUrl: "https://storage.example/doc.enc",
    fileKey,
    fileType: "docx",
    mode: "edit",
    callbackOrigin: "https://pockio.example",
    relayUrl: "wss://relay.example",
    ...overrides,
  };
}

async function encryptedSession(fileType: "docx" | "xlsx" | "pptx") {
  const session = createOfficeSession(
    fileType,
    new TextEncoder().encode("initial checkpoint").buffer,
    `active.${fileType}`,
  );
  return encryptFile(serializeOfficeSession(session), fileKey);
}

function makeFetch(
  encryptedBytes: ArrayBuffer,
  upload: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return upload(input, init);
    }
    return response(200, encryptedBytes);
  };
}

function response(status: number, body?: ArrayBuffer): Response {
  return new Response(body, { status });
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
