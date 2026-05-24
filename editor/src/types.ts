export type FileType = "docx" | "xlsx" | "pptx";
export type EditorMode = "edit" | "view";
export type DocumentFormat = "ooxml" | "cryptee-office-session-v1";

export interface SaveResult {
  encryptedBytes: ArrayBuffer;
  contentType: string;
  documentFormat: DocumentFormat;
}

export interface EditorConfig {
  fileUrl: string;
  fileKey: string;
  fileType: FileType;
  mode: EditorMode;
  callbackOrigin: string;
  sessionId?: string;
  relayUrl: string;
  saveUrl?: string;
  displayName?: string;
  userId?: string;
  userDisplayName?: string;
}

export type EditorErrorCode =
  | "invalid-config"
  | "fetch-failed"
  | "decrypt-failed"
  | "unsupported-format"
  | "conversion-failed"
  | "editor-load-failed"
  | "relay-connection-failed"
  | "save-upload-failed";

export type EditorToParentEvent =
  | { type: "editor:ready"; version: string }
  | { type: "editor:document-loaded" }
  | { type: "editor:saving" }
  | {
      type: "editor:saved";
      encryptedBytes: ArrayBuffer;
      contentType: string;
      documentFormat: DocumentFormat;
    }
  | { type: "editor:save-uploaded" }
  | { type: "editor:error"; code: EditorErrorCode; message: string }
  | { type: "editor:exit" }
  | { type: "editor:user-joined"; userId: string; displayName?: string }
  | { type: "editor:user-left"; userId: string };

export type ParentToEditorEvent =
  | { type: "parent:save-request" }
  | { type: "parent:export-request"; format: FileType }
  | { type: "parent:exit-request" }
  | { type: "parent:update-permissions"; mode: EditorMode }
  | { type: "parent:set-display-name"; name: string };

export interface EditorAdapter {
  mount(container: HTMLElement, documentBytes: ArrayBuffer): Promise<void>;
  exportDocument(): Promise<ArrayBuffer>;
  setMode(mode: EditorMode): void;
  setDisplayName(name: string): void;
  applyRemotePatch(patch: ArrayBuffer): void;
  onLocalPatch(handler: (patch: ArrayBuffer) => void): void;
  onSaveRequest(handler: () => void): void;
}
