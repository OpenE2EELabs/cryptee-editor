import { describe, expect, it } from "vitest";
import { parseFragment } from "../src/protocol";

describe("protocol", () => {
  it("parses a valid fragment", () => {
    const config = parseFragment(
      "#fileUrl=https%3A%2F%2Fmystorage.example.com%2Fdoc.enc&fileKey=abc&fileType=docx&callbackOrigin=https%3A%2F%2Fexample.com"
    );
    expect(config.fileType).toBe("docx");
    expect(config.mode).toBe("edit");
    expect(config.callbackOrigin).toBe("https://example.com");
  });

  it("rejects unsupported formats", () => {
    expect(() =>
      parseFragment(
        "#fileUrl=https%3A%2F%2Fmystorage.example.com%2Fdoc.enc&fileKey=abc&fileType=pdf&callbackOrigin=https%3A%2F%2Fexample.com"
      )
    ).toThrow("Unsupported fileType");
  });
});

