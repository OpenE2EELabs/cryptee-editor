import type { DocumentFormat, FileType } from "./types";

export const OFFICE_SESSION_VERSION = "cryptee-office-session-v1";
export const OFFICE_SESSION_CONTENT_TYPE =
  "application/vnd.cryptee.office-session+json";
export const OOXML_CONTENT_TYPE = "application/octet-stream";

export interface OfficeSession {
  version: typeof OFFICE_SESSION_VERSION;
  fileType: FileType;
  editorBin: ArrayBuffer;
  media: Record<string, string>;
  changes: Array<{
    id: string;
    createdAt: string;
    bytesBase64: string;
  }>;
  createdAt: string;
  updatedAt: string;
  source?: {
    name?: string;
    importedFrom: "ooxml";
  };
}

interface SerializedOfficeSession {
  version: typeof OFFICE_SESSION_VERSION;
  fileType: FileType;
  editorBinBase64: string;
  media: Record<string, string>;
  changes: OfficeSession["changes"];
  createdAt: string;
  updatedAt: string;
  source?: OfficeSession["source"];
}

export function createOfficeSession(
  fileType: FileType,
  editorBin: ArrayBuffer,
  displayName?: string,
): OfficeSession {
  const now = new Date().toISOString();
  return {
    version: OFFICE_SESSION_VERSION,
    fileType,
    editorBin: editorBin.slice(0),
    media: {},
    changes: [],
    createdAt: now,
    updatedAt: now,
    source: {
      name: displayName,
      importedFrom: "ooxml",
    },
  };
}

export function appendSessionChange(
  session: OfficeSession,
  patch: ArrayBuffer,
): OfficeSession {
  return {
    ...session,
    changes: [
      ...session.changes,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        bytesBase64: bytesToBase64(new Uint8Array(patch)),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function updateSessionCheckpoint(
  session: OfficeSession,
  editorBin: ArrayBuffer,
): OfficeSession {
  return {
    ...session,
    editorBin: editorBin.slice(0),
    updatedAt: new Date().toISOString(),
  };
}

export function serializeOfficeSession(session: OfficeSession): ArrayBuffer {
  const serialized: SerializedOfficeSession = {
    version: session.version,
    fileType: session.fileType,
    editorBinBase64: bytesToBase64(new Uint8Array(session.editorBin)),
    media: session.media,
    changes: session.changes,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    source: session.source,
  };
  return new TextEncoder().encode(JSON.stringify(serialized))
    .buffer as ArrayBuffer;
}

export function tryParseOfficeSession(
  bytes: ArrayBuffer,
): OfficeSession | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }
  const value = parsed as Partial<SerializedOfficeSession>;
  if (
    value.version !== OFFICE_SESSION_VERSION ||
    !isFileType(value.fileType) ||
    typeof value.editorBinBase64 !== "string"
  ) {
    return undefined;
  }

  return {
    version: OFFICE_SESSION_VERSION,
    fileType: value.fileType,
    editorBin: toArrayBuffer(base64ToBytes(value.editorBinBase64)),
    media: value.media ?? {},
    changes: value.changes ?? [],
    createdAt: value.createdAt ?? new Date().toISOString(),
    updatedAt: value.updatedAt ?? new Date().toISOString(),
    source: value.source,
  };
}

export function documentFormatForContentType(
  contentType: string,
): DocumentFormat {
  return contentType === OFFICE_SESSION_CONTENT_TYPE
    ? OFFICE_SESSION_VERSION
    : "ooxml";
}

function isFileType(value: unknown): value is FileType {
  return value === "docx" || value === "xlsx" || value === "pptx";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
