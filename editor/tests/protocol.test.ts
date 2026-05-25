import { describe, expect, it } from "vitest";
import { createProtocolBridge, parseFragment } from "../src/protocol";

describe("protocol", () => {
  it("parses a valid fragment", () => {
    const config = parseFragment(
      "#fileUrl=https%3A%2F%2Fmystorage.example.com%2Fdoc.enc&fileKey=abc&fileType=docx&callbackOrigin=https%3A%2F%2Fexample.com",
    );
    expect(config.fileType).toBe("docx");
    expect(config.mode).toBe("edit");
    expect(config.callbackOrigin).toBe("https://example.com");
  });

  it("rejects unsupported formats", () => {
    expect(() =>
      parseFragment(
        "#fileUrl=https%3A%2F%2Fmystorage.example.com%2Fdoc.enc&fileKey=abc&fileType=pdf&callbackOrigin=https%3A%2F%2Fexample.com",
      ),
    ).toThrow("Unsupported fileType");
  });

  it("lets explicit edit-share flags override a stale view mode", () => {
    const config = parseFragment(
      "#fileUrl=https%3A%2F%2Fmystorage.example.com%2Fdoc.enc&fileKey=abc&fileType=docx&callbackOrigin=https%3A%2F%2Fexample.com&mode=view&canEdit=true",
    );

    expect(config.mode).toBe("edit");
  });

  it("accepts typed export requests from the configured origin only", () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: (
          _type: string,
          handler: (event: MessageEvent) => void,
        ) => {
          listener = handler;
        },
        removeEventListener: () => {
          listener = undefined;
        },
        parent: { postMessage: () => undefined },
      },
    });

    const bridge = createProtocolBridge("https://example.com");
    const received: unknown[] = [];
    bridge.onMessage((event) => received.push(event));

    listener?.({
      origin: "https://example.com",
      data: { type: "parent:export-request", format: "docx" },
    } as MessageEvent);
    listener?.({
      origin: "https://evil.example",
      data: { type: "parent:export-request", format: "docx" },
    } as MessageEvent);
    listener?.({
      origin: "https://example.com",
      data: { type: "parent:export-request", format: "pdf" },
    } as MessageEvent);
    listener?.({
      origin: "https://example.com",
      data: { type: "parent:update-permissions", canEdit: true },
    } as MessageEvent);

    expect(received).toEqual([
      { type: "parent:export-request", format: "docx" },
      { type: "parent:update-permissions", canEdit: true },
    ]);
    bridge.destroy();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });
});
