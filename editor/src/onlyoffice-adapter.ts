import type { EditorAdapter, EditorMode, FileType } from "./types";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        placeholderId: string,
        config: unknown,
      ) => CryptPadDocEditor;
    };
    APP?: Record<string, unknown> & {
      AddImage?: (
        callback: (result: { url: string }) => void,
        errorCallback?: (error?: unknown) => void,
      ) => void;
      getImageURL?: (name: string, callback: (url: string) => void) => void;
    };
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
  insertImage?: (...args: unknown[]) => unknown;
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
  getMedia?: () => Record<string, string>;
  onMediaChange?: (media: Record<string, string>) => void;
}

type OutgoingSaveChangesMessage = {
  type?: string;
  changes?: unknown;
  startSaveChanges?: boolean;
  endSaveChanges?: boolean;
  deleteIndex?: unknown;
  excelAdditionalInfo?: unknown;
  unlock?: unknown;
  releaseLocks?: unknown;
};

type IncomingSaveChangesMessage = {
  type: "saveChanges";
  changes: Array<{
    change: string;
    time: number;
    user: string;
    useridoriginal: string;
    username: string;
  }>;
  changesIndex: number;
  syncChangesIndex: number;
  startSaveChanges: boolean;
  endSaveChanges: boolean;
  deleteIndex?: unknown;
  excelAdditionalInfo?: unknown;
  unlock?: unknown;
  releaseLocks?: unknown;
};

const ONLYOFFICE_API_URL =
  "./vendor/onlyoffice-editor/web-apps/apps/api/documents/api.js";
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
const MAX_RIGHTS_UPDATE_ATTEMPTS = 20;

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
  private rightsUpdateTimer: number | undefined;
  private rightsUpdateAttempts = 0;

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
    window.APP.AddImage = (callback, errorCallback) =>
      this.addImageFromLocalFile(callback, errorCallback);
    this.editor.connectMockServer(this.createMockServer());
    this.fitEditorFrame();
    await (this.editor.waitForAppReady ?? Promise.resolve());
    this.fitEditorFrame();
    this.scheduleRightsUpdate();
  }

  async exportDocument(): Promise<ArrayBuffer> {
    this.currentBin = this.readNativeDocument() ?? this.currentBin;
    return this.currentBin.slice(0);
  }

  setMode(mode: EditorMode): void {
    this.options.mode = mode;
    this.rightsUpdateAttempts = 0;
    this.scheduleRightsUpdate();
  }

  setDisplayName(name: string): void {
    this.options.title = name;
  }

  applyRemotePatch(patch: ArrayBuffer): void {
    const message = decodePatchMessage(patch);
    if (isIncomingSaveChangesMessage(message)) {
      const rebased = rebaseIncomingSaveChangesMessage(
        message,
        this.changesIndex,
      );
      this.changesIndex = rebased.changesIndex;
      this.editor?.sendMessageToOO?.(rebased);
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
    if (this.rightsUpdateTimer !== undefined) {
      window.clearTimeout(this.rightsUpdateTimer);
      this.rightsUpdateTimer = undefined;
    }
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
        coEditing: {
          mode: "fast",
          change: true,
        },
        customization: {
          autosave: true,
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
      getImageURL: (name: string) =>
        Promise.resolve(this.resolveMediaUrl(name)),
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

    const msg = message as OutgoingSaveChangesMessage;
    if (msg.type === "isSaveLock") {
      this.editor?.sendMessageToOO?.({ type: "saveLock", saveLock: false });
      return;
    }

    if (msg.type === "forceSaveStart") {
      this.saveHandlers.forEach((handler) => handler());
      return;
    }

    if (msg.type === "saveChanges") {
      const nextChangesIndex = this.changesIndex + 1;
      const remoteMessage = createIncomingSaveChangesMessage(
        msg,
        this.options.userId ?? "local-user",
        this.options.userDisplayName ?? "Local user",
        nextChangesIndex,
      );
      if (!remoteMessage) {
        return;
      }
      const patchBytes = new TextEncoder().encode(JSON.stringify(remoteMessage));
      const patch = patchBytes.buffer.slice(
        patchBytes.byteOffset,
        patchBytes.byteOffset + patchBytes.byteLength,
      ) as ArrayBuffer;
      this.localPatchHandlers.forEach((handler) => handler(patch));
      this.changesIndex = nextChangesIndex;
      this.editor?.sendMessageToOO?.({
        type: "unSaveLock",
        index: nextChangesIndex,
        time: Date.now(),
      });
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

  private scheduleRightsUpdate(delayMs = 0): void {
    if (this.rightsUpdateTimer !== undefined) {
      window.clearTimeout(this.rightsUpdateTimer);
    }
    this.rightsUpdateTimer = window.setTimeout(() => {
      this.rightsUpdateTimer = undefined;
      this.applyRightsUpdate();
    }, delayMs);
  }

  private applyRightsUpdate(): void {
    const enabled = this.options.mode === "edit";
    try {
      this.editor?.processRightsChange?.(enabled);
      this.rightsUpdateAttempts = 0;
    } catch (error) {
      this.rightsUpdateAttempts += 1;
      if (this.rightsUpdateAttempts < MAX_RIGHTS_UPDATE_ATTEMPTS) {
        this.scheduleRightsUpdate(250);
        return;
      }
      console.warn("ONLYOFFICE rejected runtime rights update", error);
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

  private resolveMediaUrl(name: string): string {
    return resolveOnlyOfficeMediaUrl(name, this.options.getMedia?.() ?? {});
  }

  private addImageFromLocalFile(
    callback: (result: { url: string }) => void,
    errorCallback?: (error?: unknown) => void,
  ): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp";
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "0";
    document.body.append(input);

    const cleanup = () => input.remove();
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const dataUrl = String(reader.result);
            const name = uniqueMediaName(file.name || "image.png");
            const media = { ...(this.options.getMedia?.() ?? {}) };
            media[name] = dataUrl;
            media[normalizeMediaName(name)] = dataUrl;
            this.options.onMediaChange?.(media);
            callback({ url: dataUrl });
          } catch (error) {
            errorCallback?.(error);
          } finally {
            cleanup();
          }
        };
        reader.onerror = () => {
          errorCallback?.(reader.error);
          cleanup();
        };
        reader.readAsDataURL(file);
      },
      { once: true },
    );

    input.click();
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

export function createIncomingSaveChangesMessage(
  message: OutgoingSaveChangesMessage,
  userId: string,
  username: string,
  changesIndex: number,
  time = Date.now(),
): IncomingSaveChangesMessage | undefined {
  if (message.type !== "saveChanges") {
    return undefined;
  }
  const change = serializeOnlyOfficeChanges(message.changes);
  if (!change) {
    return undefined;
  }
  return {
    type: "saveChanges",
    changes: [
      {
        change,
        time,
        user: userId,
        useridoriginal: userId,
        username,
      },
    ],
    changesIndex,
    syncChangesIndex: changesIndex,
    startSaveChanges: message.startSaveChanges !== false,
    endSaveChanges: message.endSaveChanges !== false,
    deleteIndex: message.deleteIndex,
    excelAdditionalInfo: message.excelAdditionalInfo,
    unlock: message.unlock,
    releaseLocks: message.releaseLocks,
  };
}

export function rebaseIncomingSaveChangesMessage(
  message: IncomingSaveChangesMessage,
  currentChangesIndex: number,
): IncomingSaveChangesMessage {
  const changesIndex = currentChangesIndex + message.changes.length;
  return {
    ...message,
    changesIndex,
    syncChangesIndex: changesIndex,
  };
}

function serializeOnlyOfficeChanges(changes: unknown): string | undefined {
  if (typeof changes === "string") {
    try {
      return Array.isArray(JSON.parse(changes)) ? changes : undefined;
    } catch {
      return undefined;
    }
  }
  return Array.isArray(changes) ? JSON.stringify(changes) : undefined;
}

function isIncomingSaveChangesMessage(
  message: unknown,
): message is IncomingSaveChangesMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Partial<IncomingSaveChangesMessage>;
  return (
    candidate.type === "saveChanges" &&
    Number.isSafeInteger(candidate.changesIndex) &&
    Array.isArray(candidate.changes) &&
    candidate.changes.every(
      (change) =>
        change &&
        typeof change === "object" &&
        typeof change.change === "string",
    )
  );
}

function normalizeMediaName(name: string): string {
  return name.replaceAll("\\", "/").split("/").pop() ?? name;
}

export function resolveOnlyOfficeMediaUrl(
  name: string,
  media: Record<string, string>,
): string {
  if (isInlineMediaUrl(name)) {
    return name;
  }

  const normalized = normalizeMediaName(name);
  const direct = media[name] ?? media[normalized];
  if (direct) {
    return direct;
  }

  console.warn("ONLYOFFICE requested missing media asset", name);
  return TRANSPARENT_PIXEL;
}

function isInlineMediaUrl(value: string): boolean {
  return value.startsWith("data:image/") || value.startsWith("blob:");
}

function uniqueMediaName(originalName: string): string {
  const basename = normalizeMediaName(originalName).replace(
    /[^A-Za-z0-9._-]/g,
    "_",
  );
  const extension = extensionFor(basename);
  return `image-${crypto.randomUUID()}${extension}`;
}

function extensionFor(name: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(name);
  return match ? match[0].toLowerCase() : ".png";
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
