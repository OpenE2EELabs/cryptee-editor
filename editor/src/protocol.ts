import type { EditorConfig, EditorToParentEvent, FileType, ParentToEditorEvent } from "./types";

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
  const required = ["fileUrl", "fileKey", "fileType", "callbackOrigin"] as const;

  for (const key of required) {
    if (!params.get(key)) {
      throw new ProtocolError(`Missing required URL fragment parameter: ${key}`);
    }
  }

  const fileType = params.get("fileType") as FileType;
  if (!SUPPORTED_FILE_TYPES.includes(fileType)) {
    throw new ProtocolError(`Unsupported fileType: ${fileType}`);
  }

  const mode = params.get("mode") ?? "edit";
  if (mode !== "edit" && mode !== "view") {
    throw new ProtocolError("mode must be 'edit' or 'view'");
  }

  const callbackOrigin = params.get("callbackOrigin") ?? "";
  validateOrigin(callbackOrigin);

  const fileUrl = params.get("fileUrl") ?? "";
  if (!fileUrl.startsWith("https://") && !fileUrl.startsWith("blob:")) {
    throw new ProtocolError("fileUrl must be HTTPS or a browser Blob URL");
  }

  const saveUrl = params.get("saveUrl") ?? undefined;
  if (saveUrl && !saveUrl.startsWith("https://") && !saveUrl.startsWith("blob:")) {
    throw new ProtocolError("saveUrl must be HTTPS when provided");
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
    userDisplayName: params.get("userDisplayName") ?? undefined
  };
}

export function validateOrigin(origin: string): void {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !["https:", "http:"].includes(parsed.protocol)) {
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
      window.parent.postMessage(event, callbackOrigin, event.type === "editor:saved" ? [event.encryptedBytes] : []);
    },
    onMessage(listener: (event: ParentToEditorEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy(): void {
      window.removeEventListener("message", onMessage);
      listeners.clear();
    }
  };
}

function isParentEvent(value: unknown): value is ParentToEditorEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const type = (value as { type: string }).type;
  return (
    type === "parent:save-request" ||
    type === "parent:exit-request" ||
    type === "parent:update-permissions" ||
    type === "parent:set-display-name"
  );
}

