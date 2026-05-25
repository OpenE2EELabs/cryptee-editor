import { describe, expect, it } from "vitest";
import {
  documentFileTypeFor,
  resolveOnlyOfficeMediaUrl,
} from "../src/onlyoffice-adapter";

describe("ONLYOFFICE adapter config", () => {
  it("uses valid ONLYOFFICE document file types instead of internal bin", () => {
    expect(documentFileTypeFor("docx")).toBe("docx");
    expect(documentFileTypeFor("xlsx")).toBe("xlsx");
    expect(documentFileTypeFor("pptx")).toBe("pptx");
  });

  it("passes inline image URLs back to ONLYOFFICE media loading", () => {
    const dataUrl = "data:image/png;base64,abc123";

    expect(resolveOnlyOfficeMediaUrl(dataUrl, {})).toBe(dataUrl);
  });

  it("resolves imported media sidecars by full path or basename", () => {
    const mediaUrl = "data:image/png;base64,sidecar";

    expect(resolveOnlyOfficeMediaUrl("word/media/image1.png", {
      "image1.png": mediaUrl,
    })).toBe(mediaUrl);
  });
});
