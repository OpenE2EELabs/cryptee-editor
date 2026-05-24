import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_PATCH_HISTORY = Number(process.env.MAX_PATCH_HISTORY ?? 1000);
const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR;
const MAX_PAYLOAD_BYTES = Number(process.env.MAX_PAYLOAD_BYTES ?? 256 * 1024);
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 50);
const MAX_CHANNELS_PER_CONNECTION = Number(process.env.MAX_CHANNELS_PER_CONNECTION ?? 1);
const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

interface ClientMeta {
  channelId: string;
  userId: string;
  displayName?: string;
  ip: string;
  tokens: number;
  lastRefill: number;
}

const channels = new Map<string, Set<WebSocket>>();
const history = new Map<string, Buffer[]>();
const clients = new WeakMap<WebSocket, ClientMeta>();
const connectionsByIp = new Map<string, number>();

const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD_BYTES });

wss.on("connection", (socket, request) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const channelId = requestUrl.searchParams.get("channel");
  if (!channelId) {
    socket.close(1008, "missing channel");
    return;
  }

  const ip = request.socket.remoteAddress ?? "unknown";
  const currentConnections = connectionsByIp.get(ip) ?? 0;
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    socket.close(1013, "too many connections");
    return;
  }

  connectionsByIp.set(ip, currentConnections + 1);
  const meta: ClientMeta = {
    channelId,
    userId: requestUrl.searchParams.get("userId") ?? randomUUID(),
    displayName: requestUrl.searchParams.get("displayName") ?? undefined,
    ip,
    tokens: 120,
    lastRefill: Date.now()
  };
  clients.set(socket, meta);
  joinChannel(channelId, socket);

  for (const patch of history.get(channelId) ?? []) {
    socket.send(patch);
  }

  broadcastControl(channelId, socket, {
    type: "user-joined",
    userId: meta.userId,
    displayName: meta.displayName
  });

  socket.on("message", (data, isBinary) => {
    if (!consumeToken(meta)) {
      socket.close(1013, "rate limit");
      return;
    }
    if (!isBinary) {
      return;
    }
    const patch = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    rememberPatch(channelId, patch);
    broadcastPatch(channelId, socket, patch);
  });

  socket.on("close", () => {
    leaveChannel(channelId, socket);
    connectionsByIp.set(ip, Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1));
    broadcastControl(channelId, socket, { type: "user-left", userId: meta.userId });
  });
});

function joinChannel(channelId: string, socket: WebSocket): void {
  if (MAX_CHANNELS_PER_CONNECTION < 1) {
    socket.close(1011, "server misconfigured");
    return;
  }
  const set = channels.get(channelId) ?? new Set<WebSocket>();
  set.add(socket);
  channels.set(channelId, set);
}

function leaveChannel(channelId: string, socket: WebSocket): void {
  const set = channels.get(channelId);
  if (!set) {
    return;
  }
  set.delete(socket);
  if (set.size === 0) {
    channels.delete(channelId);
  }
}

function rememberPatch(channelId: string, patch: Buffer): void {
  const patches = history.get(channelId) ?? [];
  patches.push(Buffer.from(patch));
  while (patches.length > MAX_PATCH_HISTORY) {
    patches.shift();
  }
  history.set(channelId, patches);
}

function broadcastPatch(channelId: string, sender: WebSocket, patch: Buffer): void {
  for (const client of channels.get(channelId) ?? []) {
    if (client !== sender && client.readyState === 1) {
      client.send(patch);
    }
  }
}

function broadcastControl(channelId: string, sender: WebSocket, message: unknown): void {
  const payload = JSON.stringify(message);
  for (const client of channels.get(channelId) ?? []) {
    if (client !== sender && client.readyState === 1) {
      client.send(payload);
    }
  }
}

function consumeToken(meta: ClientMeta): boolean {
  const now = Date.now();
  const refill = Math.floor((now - meta.lastRefill) / 1000) * 20;
  if (refill > 0) {
    meta.tokens = Math.min(120, meta.tokens + refill);
    meta.lastRefill = now;
  }
  if (meta.tokens <= 0) {
    return false;
  }
  meta.tokens -= 1;
  return true;
}

if (CHECKPOINT_DIR) {
  setInterval(() => {
    void checkpoint();
  }, CHECKPOINT_INTERVAL_MS).unref();
}

async function checkpoint(): Promise<void> {
  if (!CHECKPOINT_DIR) {
    return;
  }
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  const snapshot = [...history.entries()].map(([channelId, patches]) => ({
    channelId,
    patches: patches.map((patch) => patch.toString("base64"))
  }));
  await writeFile(join(CHECKPOINT_DIR, "checkpoint.json"), JSON.stringify(snapshot));
}

server.listen(PORT, () => {
  console.log(`cryptee-editor relay listening on :${PORT}`);
});
