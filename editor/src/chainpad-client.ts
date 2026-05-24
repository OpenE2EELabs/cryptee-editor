import { deriveSessionKey } from "./crypto";
import type { EditorConfig, EditorToParentEvent } from "./types";

const MAX_BACKOFF_MS = 30_000;

export class ChainPadClient {
  private socket: WebSocket | undefined;
  private reconnectAttempt = 0;
  private readonly channelId: string;

  constructor(
    private readonly config: EditorConfig,
    private readonly emit: (event: EditorToParentEvent) => void,
    private readonly onPatch: (patch: ArrayBuffer) => void
  ) {
    this.channelId = config.sessionId ?? "";
  }

  async connect(): Promise<void> {
    if (!this.config.sessionId) {
      return;
    }
    await deriveSessionKey(this.config.sessionId, this.config.fileKey);
    await this.open();
  }

  sendPatch(patch: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(patch);
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
    this.socket.addEventListener("message", (event) => this.handleMessage(event));
    this.socket.addEventListener("close", () => this.scheduleReconnect());
    this.socket.addEventListener("error", () => {
      this.emit({
        type: "editor:error",
        code: "relay-connection-failed",
        message: "Collaboration relay connection failed."
      });
    });
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.onPatch(event.data);
      return;
    }
    if (typeof event.data !== "string") {
      return;
    }
    try {
      const message = JSON.parse(event.data) as { type?: string; userId?: string; displayName?: string };
      if (message.type === "user-joined" && message.userId) {
        this.emit({ type: "editor:user-joined", userId: message.userId, displayName: message.displayName });
      }
      if (message.type === "user-left" && message.userId) {
        this.emit({ type: "editor:user-left", userId: message.userId });
      }
    } catch {
      this.emit({
        type: "editor:error",
        code: "relay-connection-failed",
        message: "Relay sent an invalid control message."
      });
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 2 ** this.reconnectAttempt * 500);
    this.reconnectAttempt += 1;
    window.setTimeout(() => void this.open(), delay);
  }
}

