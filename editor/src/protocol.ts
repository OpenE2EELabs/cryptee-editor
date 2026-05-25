import type {
  EditorConfig,
  EditorMode,
  EditorToParentEvent,
  FileType,
  ParentToEditorEvent,
} from "./types";

const DEFAULT_RELAY_URL = "wss://relay.cryptee-editor.example/"; // TODO: replace after community relay deployment.
const SUPPORTED_FILE_TYPES: readonly FileType[] = ["docx", "xlsx", "pptx"];

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function parseFragment(hash = window.location.hash): EditorConfig {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const required = [
    "fileUrl",
    "fileKey",
    "fileType",
    "callbackOrigin",
  ] as const;

  for (const key of required) {
    if (!params.get(key)) {
      throw new ProtocolError(
        `Missing required URL fragment parameter: ${key}`,
      );
    }
  }

  const fileType = params.get("fileType") as FileType;
  if (!SUPPORTED_FILE_TYPES.includes(fileType)) {
    throw new ProtocolError(`Unsupported fileType: ${fileType}`);
  }

  const mode = modeFromParams(params);
  if (mode !== "edit" && mode !== "view") {
    throw new ProtocolError("mode must be 'edit' or 'view'");
  }

  const callbackOrigin = params.get("callbackOrigin") ?? "";
  validateOrigin(callbackOrigin);

  const fileUrl = params.get("fileUrl") ?? "";
  if (!isAllowedFileTransferUrl(fileUrl)) {
    throw new ProtocolError(
      "fileUrl must be HTTPS, a browser Blob URL, or localhost for development",
    );
  }

  const saveUrl = params.get("saveUrl") ?? undefined;
  if (saveUrl && !isAllowedFileTransferUrl(saveUrl)) {
    throw new ProtocolError(
      "saveUrl must be HTTPS, a browser Blob URL, or localhost for development",
    );
  }

  return {
    fileUrl,
    fileKey: params.get("fileKey") ?? "",
    fileType,
    mode,
    callbackOrigin,
    relayUrl: params.get("relayUrl") || DEFAULT_RELAY_URL,
    sessionId: params.get("sessionId") ?? undefined,
    saveUrl,
    displayName: params.get("displayName") ?? undefined,
    userId: params.get("userId") ?? undefined,
    userDisplayName: params.get("userDisplayName") ?? undefined,
  };
}

function modeFromParams(params: URLSearchParams): EditorMode {
  const explicitMode = params.get("mode");
  const canEdit = params.get("canEdit") ?? params.get("editable");
  const permission = params.get("permission") ?? params.get("permissions");
  if (
    canEdit === "true" ||
    canEdit === "1" ||
    permission === "edit" ||
    permission === "write"
  ) {
    return "edit";
  }
  if (
    canEdit === "false" ||
    canEdit === "0" ||
    permission === "view" ||
    permission === "read"
  ) {
    return "view";
  }
  return (explicitMode ?? "edit") as EditorMode;
}

function isAllowedFileTransferUrl(value: string): boolean {
  if (value.startsWith("https://") || value.startsWith("blob:")) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function validateOrigin(origin: string): void {
  try {
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      !["https:", "http:"].includes(parsed.protocol)
    ) {
      throw new Error("invalid origin");
    }
  } catch {
    throw new ProtocolError("callbackOrigin must be a valid origin");
  }
}

export function createProtocolBridge(callbackOrigin: string) {
  const listeners = new Set<(event: ParentToEditorEvent) => void>();

  const onMessage = (message: MessageEvent) => {
    if (message.origin !== callbackOrigin) {
      return;
    }
    if (isParentEvent(message.data)) {
      for (const listener of listeners) {
        listener(message.data);
      }
    }
  };

  window.addEventListener("message", onMessage);

  return {
    emit(event: EditorToParentEvent): void {
      window.parent.postMessage(
        event,
        callbackOrigin,
        event.type === "editor:saved" ? [event.encryptedBytes] : [],
      );
    },
    onMessage(listener: (event: ParentToEditorEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy(): void {
      window.removeEventListener("message", onMessage);
      listeners.clear();
    },
  };
}

function isParentEvent(value: unknown): value is ParentToEditorEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const type = (value as { type: string }).type;
  if (type === "parent:export-request") {
    return SUPPORTED_FILE_TYPES.includes(
      (value as { format?: FileType }).format as FileType,
    );
  }
  if (type === "parent:update-permissions") {
    const event = value as { mode?: unknown; canEdit?: unknown };
    return (
      (event.mode === undefined ||
        event.mode === "edit" ||
        event.mode === "view") &&
      (event.canEdit === undefined || typeof event.canEdit === "boolean")
    );
  }
  return (
    type === "parent:save-request" ||
    type === "parent:exit-request" ||
    type === "parent:set-display-name"
  );
}
