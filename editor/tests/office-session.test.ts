import { describe, expect, it } from "vitest";
import {
  appendSessionChange,
  createOfficeSession,
  OFFICE_SESSION_VERSION,
  serializeOfficeSession,
  tryParseOfficeSession,
  updateSessionCheckpoint,
} from "../src/office-session";

describe("office session format", () => {
  it("roundtrips the internal editor checkpoint", () => {
    const editorBin = new TextEncoder().encode("native editor bytes").buffer;
    const session = createOfficeSession("docx", editorBin, "document.docx");
    const parsed = tryParseOfficeSession(serializeOfficeSession(session));

    expect(parsed?.version).toBe(OFFICE_SESSION_VERSION);
    expect(parsed?.fileType).toBe("docx");
    expect(new TextDecoder().decode(parsed?.editorBin)).toBe(
      "native editor bytes",
    );
    expect(parsed?.source?.name).toBe("document.docx");
  });

  it("stores encrypted collaboration patch payloads separately from checkpoints", () => {
    const session = createOfficeSession("pptx", new ArrayBuffer(1));
    const withChange = appendSessionChange(
      session,
      new TextEncoder().encode("saveChanges").buffer,
    );
    const checkpoint = updateSessionCheckpoint(
      withChange,
      new TextEncoder().encode("checkpoint").buffer,
    );

    expect(checkpoint.changes).toHaveLength(1);
    expect(new TextDecoder().decode(checkpoint.editorBin)).toBe("checkpoint");
  });
});
