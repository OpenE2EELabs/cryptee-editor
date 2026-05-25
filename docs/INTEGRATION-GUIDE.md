# Integration Guide

This guide shows how to integrate cryptee-editor into any web application.

## Prerequisites

Your application needs HTTPS storage for encrypted file bytes, browser-side key generation, URL fragments, and `postMessage` event handling. Collaboration also needs a WebSocket relay.

## Step 1: Encrypt Your File

```ts
export async function encryptForEditor(fileBytes: ArrayBuffer) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, fileBytes));
  const encryptedBytes = new Uint8Array(nonce.length + ciphertext.length);
  encryptedBytes.set(nonce, 0);
  encryptedBytes.set(ciphertext, nonce.length);
  return { encryptedBytes, fileKey: btoa(String.fromCharCode(...rawKey)) };
}
```

## Step 2: Upload To Storage

Upload `encryptedBytes` to an object store and create a short-lived HTTPS read URL. For S3-compatible, B2-compatible, R2-compatible, or CDN-backed storage, use the provider SDK on your application server to generate signed URLs. The signed URL should allow `GET` for open and optionally `PUT` for direct save.

## Step 3: Construct The Editor URL

```ts
const editorUrl = new URL("https://editor.example.com/");
editorUrl.hash = new URLSearchParams({
  fileUrl: signedReadUrl,
  fileKey,
  fileType: "docx",
  callbackOrigin: location.origin,
  mode: "edit",
  displayName: "Quarterly plan.docx"
}).toString();
```

## Step 4: Open The Editor

Redirects are simple and isolate UI. Iframes keep the user inside your app but require careful origin checks. In both cases, never place `fileKey` in the query string or path.

```ts
const iframe = document.createElement("iframe");
iframe.src = editorUrl.toString();
iframe.allow = "clipboard-read; clipboard-write";
document.body.append(iframe);
```

## Step 5: Handle The Save Event

```ts
window.addEventListener("message", async (event) => {
  if (event.origin !== "https://editor.example.com") return;
  if (event.data?.type === "editor:saved") {
    await uploadEncryptedBytes(event.data.encryptedBytes, {
      contentType: event.data.contentType,
      documentFormat: event.data.documentFormat
    });
  }
});
```

If you provide `saveUrl`, cryptee-editor uploads encrypted bytes directly and then emits both `editor:save-uploaded` and `editor:saved`.

For production editing, store the returned `documentFormat: "cryptee-office-session-v1"` bytes as the active editable file. This avoids converting the original DOCX/XLSX/PPTX on every open. To produce a standard Office download, send:

```ts
iframe.contentWindow?.postMessage({ type: "parent:export-request", format: "docx" }, "https://editor.example.com");
```

The next `editor:saved` event will contain encrypted OOXML bytes with `documentFormat: "ooxml"`.

## Step 6: Collaboration

Generate a fresh `sessionId` for a collaborative editing room and share the same `sessionId`, `fileKey`, `fileUrl`, and `relayUrl` with authorized users. The editor derives a collaboration key from `fileKey` and `sessionId`, encrypts ONLYOFFICE change payloads in the browser, and sends only opaque bytes to the relay. The relay does not enforce authorization.

For Pockio-style NAS/device uploads, treat the `cryptee-office-session-v1` object as the live editable object for DOCX, PPTX, and XLSX. Every user who should co-edit must receive URLs for that same encrypted active object plus the same `sessionId`; do not fork one uploaded Office file into per-user editor copies. When users want a normal Office file, call `parent:export-request` and offer the returned `documentFormat: "ooxml"` bytes as a download or compatibility handoff without replacing the active editable object unless the user explicitly finalizes it.

Before calling a collaborative integration production-ready, verify:

- Two browser windows with different `userId` values can join the same `sessionId`.
- A patch from one browser reaches the other through the relay.
- A late joiner receives relay history for the same session.
- A browser using a different `sessionId` does not receive those patches.
- Save persists `cryptee-office-session-v1` as the active editable object.
- Export produces OOXML only through an explicit export request.

## Security Considerations For Integrators

- Never log `fileKey`.
- Never send `fileKey` through your server.
- Use SRI or version-pinned editor assets in production.
- Self-host the editor for high-trust deployments.
- Keep signed URLs short-lived and scoped to one object.

## Common Patterns

- Single-user edit: omit `sessionId`.
- Shared edit: include `sessionId` and relay URL for each authorized user.
- View-only sharing: set `mode=view`.
- Time-limited sessions: expire signed URLs and collaboration invitations.

## Troubleshooting

- `invalid-config`: check required fragment parameters.
- `fetch-failed`: verify CORS and signed URL expiration.
- `decrypt-failed`: confirm the key matches the encrypted bytes.
- `editor-load-failed`: run `scripts/fetch-vendor.sh` and rebuild.
- `relay-connection-failed`: test the WebSocket endpoint and TLS certificate.
