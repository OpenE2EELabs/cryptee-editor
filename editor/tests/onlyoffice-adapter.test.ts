import { describe, expect, it } from "vitest";
import { documentFileTypeFor } from "../src/onlyoffice-adapter";

describe("ONLYOFFICE adapter config", () => {
  it("uses valid ONLYOFFICE document file types instead of internal bin", () => {
    expect(documentFileTypeFor("docx")).toBe("docx");
    expect(documentFileTypeFor("xlsx")).toBe("xlsx");
    expect(documentFileTypeFor("pptx")).toBe("pptx");
  });
});
