import { describe, expect, it } from "vitest";
import {
  createIncomingSaveChangesMessage,
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

  it("normalizes outgoing ONLYOFFICE changes into peer server messages", () => {
    const patch = createIncomingSaveChangesMessage(
      {
        type: "saveChanges",
        changes: JSON.stringify([{ op: "insert" }]),
        startSaveChanges: true,
        endSaveChanges: true,
      },
      "user-2",
      "Collaborator",
      4,
      12345,
    );

    expect(patch).toEqual({
      type: "saveChanges",
      changes: [
        {
          change: '[{"op":"insert"}]',
          time: 12345,
          user: "user-2",
          useridoriginal: "user-2",
          username: "Collaborator",
        },
      ],
      changesIndex: 4,
      syncChangesIndex: 4,
      startSaveChanges: true,
      endSaveChanges: true,
      deleteIndex: undefined,
      excelAdditionalInfo: undefined,
      unlock: undefined,
      releaseLocks: undefined,
    });
  });

  it("does not relay per-client acknowledgements or malformed changes", () => {
    expect(
      createIncomingSaveChangesMessage(
        { type: "unSaveLock" },
        "user-2",
        "Collaborator",
        1,
      ),
    ).toBeUndefined();
    expect(
      createIncomingSaveChangesMessage(
        { type: "saveChanges", changes: "{}" },
        "user-2",
        "Collaborator",
        1,
      ),
    ).toBeUndefined();
  });
});
