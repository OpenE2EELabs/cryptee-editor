import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Page } from "@playwright/test";

const relayDependenciesInstalled = existsSync("../relay/node_modules/ws");

test.skip(
  !relayDependenciesInstalled,
  "install relay dependencies before running the two-browser relay smoke test",
);

test("two browsers share opaque patches through the same relay session", async ({
  baseURL,
  browser,
}) => {
  const { createRelayServer } = await import("../../../relay/src/server");
  const started = createRelayServer({ maxPatchHistory: 10 });
  const server = started.server;
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const alice = await browser.newPage();
  const bob = await browser.newPage();
  const carol = await browser.newPage();
  try {
    const baseUrl = relayUrl(server);
    const pageUrl = baseURL ?? "http://127.0.0.1:4174";
    await openRelaySocket(
      alice,
      pageUrl,
      `${baseUrl}?channel=shared&userId=alice`,
    );
    await openRelaySocket(
      bob,
      pageUrl,
      `${baseUrl}?channel=shared&userId=bob`,
    );

    await sendPatch(alice, "xlsx patch");
    await expect.poll(() => latestBinaryMessage(bob)).toEqual("xlsx patch");

    await openRelaySocket(
      carol,
      pageUrl,
      `${baseUrl}?channel=shared&userId=carol`,
    );
    await expect.poll(() => latestBinaryMessage(carol)).toEqual("xlsx patch");
  } finally {
    await alice.close();
    await bob.close();
    await carol.close();
    for (const client of started.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => started.wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function relayUrl(server: Server): string {
  const address = server.address() as AddressInfo;
  return `ws://127.0.0.1:${address.port}/`;
}

async function openRelaySocket(page: Page, pageUrl: string, url: string) {
  await page.goto(pageUrl);
  await page.evaluate((relayUrl) => {
    type RelayWindow = Window & {
      __relayMessages: Array<string | number[]>;
      __relaySocket: WebSocket;
    };
    const relayWindow = window as unknown as RelayWindow;
    relayWindow.__relayMessages = [];
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(relayUrl);
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("relay error")), {
        once: true,
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          relayWindow.__relayMessages.push(event.data);
          return;
        }
        relayWindow.__relayMessages.push([
          ...new Uint8Array(event.data as ArrayBuffer),
        ]);
      });
      relayWindow.__relaySocket = socket;
    });
  }, url);
}

async function sendPatch(page: Page, text: string) {
  await page.evaluate((message) => {
    type RelayWindow = Window & { __relaySocket: WebSocket };
    const bytes = new TextEncoder().encode(message);
    (window as unknown as RelayWindow).__relaySocket.send(bytes);
  }, text);
}

async function latestBinaryMessage(page: Page) {
  return page.evaluate(() => {
    type RelayWindow = Window & { __relayMessages: Array<string | number[]> };
    const messages = (window as unknown as RelayWindow).__relayMessages;
    let binary: number[] | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (Array.isArray(message)) {
        binary = message;
        break;
      }
    }
    return binary ? new TextDecoder().decode(new Uint8Array(binary)) : null;
  });
}
