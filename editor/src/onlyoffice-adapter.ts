import type { EditorAdapter, EditorMode, FileType } from "./types";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        placeholderId: string,
        config: unknown,
      ) => CryptPadDocEditor;
    };
    APP?: Record<string, unknown>;
  }
}

type CryptPadDocEditor = {
  connectMockServer(server: OnlyOfficeMockServer): void;
  destroyEditor(): void;
  downloadAs?: (...args: unknown[]) => unknown;
  getIframe(): HTMLIFrameElement;
  sendMessageToOO?: (message: unknown) => void;
  waitForAppReady?: Promise<void>;
  processRightsChange?: (enabled: boolean) => void;
};

export type OnlyOfficeDocumentFileType = FileType;

type OnlyOfficeMockServer = {
  getInitialChanges: () => unknown[];
  getParticipants: () => {
    index: number;
    list: Array<{
      id: number;
      idOriginal: string;
      username: string;
      indexUser: number;
      connectionId: string;
      isCloseCoAuthoring: boolean;
      view: boolean;
    }>;
  };
  getImageURL: (name: string) => Promise<string>;
  onAuth: () => void;
  onMessage: (message: unknown) => void;
  onCorruptionWarning: (duplicateId: string) => void;
};

interface AdapterOptions {
  fileType: FileType;
  mode: EditorMode;
  title: string;
  userId?: string;
  userDisplayName?: string;
}

const ONLYOFFICE_API_URL =
  "./vendor/onlyoffice-editor/web-apps/apps/api/documents/api.js";

let apiPromise: Promise<void> | undefined;

export class CryptPadOnlyOfficeAdapter implements EditorAdapter {
  private editor: CryptPadDocEditor | undefined;
  private currentBin = new ArrayBuffer(0);
  private readonly localPatchHandlers = new Set<(patch: ArrayBuffer) => void>();
  private readonly saveHandlers = new Set<() => void>();
  private resizeObserver: ResizeObserver | undefined;
  private blobUrl: string | undefined;
  private placeholderId = "";
  private changesIndex = 0;

  constructor(private readonly options: AdapterOptions) {}

  async mount(
    container: HTMLElement,
    documentBytes: ArrayBuffer,
  ): Promise<void> {
    await loadOnlyOfficeApi();
    this.currentBin = documentBytes.slice(0);
    this.placeholderId = `oo-${crypto.randomUUID()}`;
    this.blobUrl = URL.createObjectURL(
      new Blob([this.currentBin], { type: "application/octet-stream" }),
    );

    container.innerHTML = `<div id="${this.placeholderId}" class="onlyoffice-host"></div>`;

    const EditorCtor = window.DocsAPI?.DocEditor;
    if (!EditorCtor) {
      throw new Error(
        "CryptPad ONLYOFFICE API loaded without DocsAPI.DocEditor",
      );
    }

    this.editor = new EditorCtor(this.placeholderId, this.buildConfig());
    window.APP = window.APP ?? {};
    this.editor.connectMockServer(this.createMockServer());
    this.fitEditorFrame();
    await (this.editor.waitForAppReady ?? Promise.resolve());
    this.fitEditorFrame();
  }

  async exportDocument(): Promise<ArrayBuffer> {
    this.currentBin = this.readNativeDocument() ?? this.currentBin;
    return this.currentBin.slice(0);
  }

  setMode(mode: EditorMode): void {
    this.options.mode = mode;
    try {
      this.editor?.processRightsChange?.(mode === "edit");
    } catch (error) {
      console.warn("ONLYOFFICE rejected runtime rights update", error);
    }
  }

  setDisplayName(name: string): void {
    this.options.title = name;
  }

  applyRemotePatch(patch: ArrayBuffer): void {
    const message = decodePatchMessage(patch);
    if (message) {
      this.editor?.sendMessageToOO?.(message);
    }
  }

  onLocalPatch(handler: (patch: ArrayBuffer) => void): void {
    this.localPatchHandlers.add(handler);
  }

  onSaveRequest(handler: () => void): void {
    this.saveHandlers.add(handler);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.editor?.destroyEditor();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  private buildConfig(): unknown {
    return {
      type: "desktop",
      width: "100%",
      height: "100%",
      documentType: documentTypeFor(this.options.fileType),
      document: {
        fileType: documentFileTypeFor(this.options.fileType),
        key: crypto.randomUUID(),
        title: this.options.title,
        url: this.blobUrl,
        permissions: {
          edit: this.options.mode === "edit",
          download: false,
          print: false,
          review: this.options.mode === "edit",
        },
      },
      editorConfig: {
        lang: "en",
        mode: this.options.mode,
        user: {
          id: this.options.userId ?? "anonymous",
          name: this.options.userDisplayName ?? "Anonymous",
        },
        customization: {
          autosave: false,
          compactHeader: true,
          forcesave: true,
        },
      },
      events: {
        onRequestSaveAs: () =>
          this.saveHandlers.forEach((handler) => handler()),
      },
    };
  }

  private createMockServer(): OnlyOfficeMockServer {
    const participantId = this.options.userId ?? "local-user";
    return {
      getInitialChanges: () => [],
      getParticipants: () => ({
        index: 1,
        list: [
          {
            id: 1,
            idOriginal: participantId,
            username: this.options.userDisplayName ?? "Local user",
            indexUser: 1,
            connectionId: participantId,
            isCloseCoAuthoring: false,
            view: this.options.mode === "view",
          },
        ],
      }),
      getImageURL: async () => "",
      onAuth: () => undefined,
      onMessage: (message: unknown) => this.handleOnlyOfficeMessage(message),
      onCorruptionWarning: (duplicateId: string) => {
        console.warn("ONLYOFFICE duplicate document object id", duplicateId);
      },
    };
  }

  private handleOnlyOfficeMessage(message: unknown): void {
    if (!message || typeof message !== "object") {
      return;
    }

    const msg = message as { type?: string; changes?: unknown; data?: unknown };
    if (msg.type === "isSaveLock") {
      this.editor?.sendMessageToOO?.({ type: "saveLock", saveLock: false });
      return;
    }

    if (msg.type === "forceSaveStart") {
      this.saveHandlers.forEach((handler) => handler());
      return;
    }

    if (msg.type === "saveChanges" || msg.type === "unSaveLock") {
      const patchBytes = new TextEncoder().encode(JSON.stringify(msg));
      const patch = patchBytes.buffer.slice(
        patchBytes.byteOffset,
        patchBytes.byteOffset + patchBytes.byteLength,
      ) as ArrayBuffer;
      this.localPatchHandlers.forEach((handler) => handler(patch));
      if (msg.type === "saveChanges") {
        this.editor?.sendMessageToOO?.({
          type: "unSaveLock",
          index: this.changesIndex++,
          time: Date.now(),
        });
      }
      return;
    }

    if (msg.type === "unLockDocument") {
      this.editor?.sendMessageToOO?.({
        type: "unSaveLock",
        index: this.changesIndex,
        time: Date.now(),
      });
    }
  }

  private readNativeDocument(): ArrayBuffer | undefined {
    const frameWindow = this.editor?.getIframe()?.contentWindow as
      | (Window & {
          editor?: {
            asc_nativeGetFile?: () => unknown;
          };
        })
      | undefined;
    const bytes = frameWindow?.editor?.asc_nativeGetFile?.();
    return normalizeNativeBytes(bytes);
  }

  private fitEditorFrame(): void {
    const host = document.getElementById(this.placeholderId);
    const iframe = this.editor?.getIframe?.();
    if (!host || !iframe) {
      return;
    }

    host.style.width = "100%";
    host.style.height = "100%";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.setAttribute("width", "100%");
    iframe.setAttribute("height", "100%");

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => this.notifyResize());
    });
    this.resizeObserver.observe(host);
    this.notifyResize();
    window.setTimeout(() => this.notifyResize(), 250);
  }

  private notifyResize(): void {
    window.dispatchEvent(new Event("resize"));
    try {
      this.editor
        ?.getIframe?.()
        .contentWindow?.dispatchEvent(new Event("resize"));
    } catch {
      // Some browsers can reject iframe access while ONLYOFFICE is still booting.
    }
  }
}

function decodePatchMessage(patch: ArrayBuffer): unknown | undefined {
  try {
    return JSON.parse(new TextDecoder().decode(patch));
  } catch {
    return undefined;
  }
}

function normalizeNativeBytes(bytes: unknown): ArrayBuffer | undefined {
  if (bytes instanceof ArrayBuffer) {
    return bytes.slice(0);
  }
  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }
  if (typeof bytes === "string") {
    return new Uint8Array([...bytes].map((char) => char.charCodeAt(0) & 0xff))
      .buffer;
  }
  return undefined;
}

async function loadOnlyOfficeApi(): Promise<void> {
  apiPromise ??= new Promise<void>((resolve, reject) => {
    if (window.DocsAPI?.DocEditor) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = ONLYOFFICE_API_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load CryptPad ONLYOFFICE API"));
    document.head.append(script);
  });

  return apiPromise;
}

function documentTypeFor(fileType: FileType): "word" | "cell" | "slide" {
  if (fileType === "xlsx") {
    return "cell";
  }
  if (fileType === "pptx") {
    return "slide";
  }
  return "word";
}

export function documentFileTypeFor(
  fileType: FileType,
): OnlyOfficeDocumentFileType {
  return fileType;
}
