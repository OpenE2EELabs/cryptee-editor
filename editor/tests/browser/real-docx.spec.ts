import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { webcrypto } from "node:crypto";

const NONCE_BYTES = 12;

test("opens an encrypted DOCX through the real CryptPad ONLYOFFICE runtime", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:4174";
  const key = webcrypto.getRandomValues(new Uint8Array(32));
  const docx = await createDocx("Cryptee browser fixture");
  const encrypted = await encryptForProtocol(docx, key);
  const keyBase64 = Buffer.from(key).toString("base64");

  await page.route("**/fixture.enc", async (route) => {
    await route.fulfill({
      body: Buffer.from(encrypted),
      contentType: "application/octet-stream"
    });
  });

  const fragment = new URLSearchParams({
    fileUrl: `${origin}/fixture.enc`,
    fileKey: keyBase64,
    fileType: "docx",
    callbackOrigin: origin,
    displayName: "fixture.docx"
  });

  await page.goto(`/#${fragment.toString()}`);
  await expect(page.getByText("ONLYOFFICE vendor assets are present")).toHaveCount(0);

  const editorFrame = page.frameLocator('iframe[name="frameEditor"]');
  await expect(editorFrame.locator("body")).toBeVisible();
  await expect(page.locator(".onlyoffice-host")).toBeVisible();
  await expect(page.locator(".licensebar")).toContainText("github.com/OpenE2EELabs/cryptee-editor");
});

async function encryptForProtocol(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<ArrayBuffer> {
  const nonce = webcrypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const key = await webcrypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, plaintext)
  );
  const out = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.byteLength);
  return out.buffer;
}

async function createDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;"
    };
    return entities[char];
  });
}
