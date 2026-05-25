import { once } from "node:events";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { createRelayServer } from "../src/server.js";

await main();

async function main(): Promise<void> {
  const started = createRelayServer({ maxPatchHistory: 10 });
  const server = started.server;
  await withTimeout(listen(server), "relay listen");

  const sockets: WebSocket[] = [];
  try {
    const baseUrl = relayUrl(server);
    const alice = await withTimeout(
      connect(`${baseUrl}?channel=shared&userId=alice`),
      "alice connect"
    );
    sockets.push(alice);
    const aliceJoined = nextJson(alice);
    const bob = await withTimeout(
      connect(`${baseUrl}?channel=shared&userId=bob`),
      "bob connect"
    );
    sockets.push(bob);

    assert.deepEqual(await withTimeout(aliceJoined, "alice joined"), {
      type: "user-joined",
      userId: "bob"
    });

    const bobPatch = nextBinary(bob);
    alice.send(Buffer.from("docx patch 1"));
    assert.equal(
      (await withTimeout(bobPatch, "bob patch 1")).toString(),
      "docx patch 1"
    );

    const carol = new WebSocket(`${baseUrl}?channel=shared&userId=carol`);
    const carolHistory = nextBinary(carol);
    await withTimeout(once(carol, "open").then(() => undefined), "carol connect");
    sockets.push(carol);
    assert.equal(
      (await withTimeout(carolHistory, "carol history")).toString(),
      "docx patch 1"
    );

    const isolated = await withTimeout(
      connect(`${baseUrl}?channel=other&userId=isolated`),
      "isolated connect"
    );
    sockets.push(isolated);
    let receivedIsolatedPatch = false;
    isolated.once("message", (data, isBinary) => {
      if (
        isBinary &&
        Buffer.from(data as Buffer).toString() === "docx patch 2"
      ) {
        receivedIsolatedPatch = true;
      }
    });

    const bobSecondPatch = nextBinary(bob);
    alice.send(Buffer.from("docx patch 2"));
    assert.equal(
      (await withTimeout(bobSecondPatch, "bob patch 2")).toString(),
      "docx patch 2"
    );
    await delay(50);
    assert.equal(receivedIsolatedPatch, false);
  } finally {
    for (const socket of sockets) {
      socket.terminate();
    }
    for (const client of started.wss.clients) {
      client.terminate();
    }
    await closeServer(started.wss, server);
  }
}

function relayUrl(server: Server): string {
  const address = server.address() as AddressInfo;
  return `ws://127.0.0.1:${address.port}/`;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, resolve);
  });
}

async function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await once(socket, "open");
  return socket;
}

function nextBinary(socket: WebSocket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        socket.off("message", onMessage);
        resolve(Buffer.from(data as Buffer));
      }
    };
    socket.on("message", onMessage);
    socket.once("close", () => reject(new Error("socket closed")));
  });
}

function nextJson(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) {
        socket.off("message", onMessage);
        resolve(JSON.parse(String(data)));
      }
    };
    socket.on("message", onMessage);
    socket.once("close", () => reject(new Error("socket closed")));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      2000
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function closeServer(
  wss: WebSocketServer,
  server: Server
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
