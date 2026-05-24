import { deriveSessionKey } from "./crypto";
import type { EditorConfig, EditorToParentEvent } from "./types";

const MAX_BACKOFF_MS = 30_000;

export class ChainPadClient {
  private socket: WebSocket | undefined;
  private reconnectAttempt = 0;
  private readonly channelId: string;
  private sessionKey: CryptoKey | undefined;

  constructor(
    private readonly config: EditorConfig,
    private readonly emit: (event: EditorToParentEvent) => void,
    private readonly onPatch: (patch: ArrayBuffer) => void,
  ) {
    this.channelId = config.sessionId ?? "";
  }

  async connect(): Promise<void> {
    if (!this.config.sessionId) {
      return;
    }
    this.sessionKey = await deriveSessionKey(
      this.config.sessionId,
      this.config.fileKey,
    );
    await this.open();
  }

  async sendPatch(patch: ArrayBuffer): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(await this.encryptPatch(patch));
    }
  }

  close(): void {
    this.socket?.close();
  }

  private async open(): Promise<void> {
    const url = new URL(this.config.relayUrl);
    url.searchParams.set("channel", this.channelId);
    if (this.config.userId) {
      url.searchParams.set("userId", this.config.userId);
    }
    if (this.config.userDisplayName) {
      url.searchParams.set("displayName", this.config.userDisplayName);
    }

    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
    });
    this.socket.addEventListener("message", (event) =>
      this.handleMessage(event),
    );
    this.socket.addEventListener("close", () => this.scheduleReconnect());
    this.socket.addEventListener("error", () => {
      this.emit({
        type: "editor:error",
        code: "relay-connection-failed",
        message: "Collaboration relay connection failed.",
      });
    });
  }

  private voidDecrypt(data: ArrayBuffer): void {
    void this.decryptPatch(data).then(
      (patch) => this.onPatch(patch),
      () =>
        this.emit({
          type: "editor:error",
          code: "relay-connection-failed",
          message: "Collaboration patch could not be decrypted.",
        }),
    );
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.voidDecrypt(event.data);
      return;
    }
    if (typeof event.data !== "string") {
      return;
    }
    try {
      const message = JSON.parse(event.data) as {
        type?: string;
        userId?: string;
        displayName?: string;
      };
      if (message.type === "user-joined" && message.userId) {
        this.emit({
          type: "editor:user-joined",
          userId: message.userId,
          displayName: message.displayName,
        });
      }
      if (message.type === "user-left" && message.userId) {
        this.emit({ type: "editor:user-left", userId: message.userId });
      }
    } catch {
      this.emit({
        type: "editor:error",
        code: "relay-connection-failed",
        message: "Relay sent an invalid control message.",
      });
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 2 ** this.reconnectAttempt * 500);
    this.reconnectAttempt += 1;
    window.setTimeout(() => void this.open(), delay);
  }

  private async encryptPatch(patch: ArrayBuffer): Promise<ArrayBuffer> {
    const key = this.requireSessionKey();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, patch),
    );
    const out = new Uint8Array(nonce.length + ciphertext.length);
    out.set(nonce);
    out.set(ciphertext, nonce.length);
    return out.buffer;
  }

  private async decryptPatch(
    encryptedPatch: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const key = this.requireSessionKey();
    const bytes = new Uint8Array(encryptedPatch);
    if (bytes.byteLength <= 12) {
      throw new Error("encrypted collaboration patch is too short");
    }
    const nonce = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    );
  }

  private requireSessionKey(): CryptoKey {
    if (!this.sessionKey) {
      throw new Error("Collaboration session key has not been initialized");
    }
    return this.sessionKey;
  }
}
