# cryptee-editor Integration Protocol v1.0

## Overview

The protocol lets any web application open encrypted DOCX, XLSX, and PPTX documents in cryptee-editor without sending plaintext document bytes to a server. It is generic, transport-agnostic, and has no app-specific assumptions.

The parent application owns storage, identity, permissions, and sharing. cryptee-editor owns only the editor runtime, browser-side encryption, browser-side format conversion, and encrypted collaboration transport.

## URL Fragment Parameters

The editor reads configuration from the URL fragment. Fragments are not sent to HTTP servers.

| Parameter | Required | Description |
| --- | --- | --- |
| `fileUrl` | Yes | HTTPS URL to fetch encrypted file bytes. Any HTTPS URL works, including object storage, signed URLs, IPFS gateways, GitHub raw URLs, and Blob URLs for local demos. |
| `fileKey` | Yes | Base64-encoded 32-byte AES-256 key. It stays in the fragment and must never be logged or sent through application servers. |
| `fileType` | Yes | One of `docx`, `xlsx`, or `pptx`. |
| `mode` | No | `edit` or `view`. Default: `edit`. |
| `sessionId` | No | UUID or equivalent opaque ID for collaboration. Omit for solo editing. |
| `relayUrl` | No | WebSocket URL for the ChainPad relay. Defaults to the build-time configured relay. |
| `callbackOrigin` | Yes | Origin allowed to receive events and send commands. The editor refuses to load without it. |
| `saveUrl` | No | HTTPS PUT/POST URL for direct upload of saved encrypted bytes. If absent, the parent handles `editor:saved`. |
| `displayName` | No | User-visible filename. |
| `userId` | No | Opaque collaboration user ID for presence display only. |
| `userDisplayName` | No | User-visible collaboration display name. |

## Events Emitted By The Editor

All events are sent to `callbackOrigin`.

```ts
{ type: "editor:ready", version: string }
{ type: "editor:document-loaded" }
{ type: "editor:saving" }
{ type: "editor:saved", encryptedBytes: ArrayBuffer, contentType: string }
{ type: "editor:save-uploaded" }
{ type: "editor:error", code: string, message: string }
{ type: "editor:exit" }
{ type: "editor:user-joined", userId: string, displayName?: string }
{ type: "editor:user-left", userId: string }
```

## Events Accepted From The Parent

The editor accepts these events only from `callbackOrigin`.

```ts
{ type: "parent:save-request" }
{ type: "parent:exit-request" }
{ type: "parent:update-permissions", mode: "edit" | "view" }
{ type: "parent:set-display-name", name: string }
```

## Error Codes

| Code | Meaning | Caller action |
| --- | --- | --- |
| `invalid-config` | Missing or invalid fragment parameter. | Rebuild the editor URL and retry. |
| `fetch-failed` | The encrypted file could not be fetched. | Refresh signed URLs or check CORS. |
| `decrypt-failed` | AES-GCM authentication failed. | Check `fileKey` and file bytes. |
| `unsupported-format` | `fileType` is not supported. | Convert before opening or reject the file. |
| `conversion-failed` | x2t conversion failed. | Offer download or retry with a clean source file. |
| `editor-load-failed` | ONLYOFFICE runtime failed to initialize. | Check vendor artifacts and browser support. |
| `relay-connection-failed` | Collaboration relay failed. | Retry, switch relay, or continue solo. |
| `save-upload-failed` | Direct upload to `saveUrl` failed. | Refresh upload URL or handle `editor:saved`. |

## Encryption Format

Files use AES-256-GCM:

- Key: 32 raw bytes, Base64 encoded in `fileKey`.
- Nonce: 12 random bytes per encryption.
- Authentication tag: 16 bytes, as produced by Web Crypto AES-GCM.
- File bytes: `nonce || ciphertext || tag`.

Compatible implementations must prepend the 12-byte nonce to the AES-GCM output. A decryptor reads the first 12 bytes as nonce and authenticates the remaining bytes.

## Example: Full Integration Flow

```ts
const key = crypto.getRandomValues(new Uint8Array(32));
const nonce = crypto.getRandomValues(new Uint8Array(12));
const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, fileBytes));
const encrypted = new Uint8Array(nonce.length + ciphertext.length);
encrypted.set(nonce, 0);
encrypted.set(ciphertext, nonce.length);

const fileUrl = await uploadEncryptedBytesAndCreateSignedUrl(encrypted);

const editorUrl = new URL("https://editor.example.com/");
editorUrl.hash = new URLSearchParams({
  fileUrl,
  fileKey: base64(key),
  fileType: "docx",
  callbackOrigin: location.origin,
  displayName: "mydocument.docx"
}).toString();

const frame = document.createElement("iframe");
frame.src = editorUrl.toString();
document.body.append(frame);

window.addEventListener("message", async (event) => {
  if (event.origin !== "https://editor.example.com") return;
  if (event.data?.type === "editor:saved") {
    await uploadEncryptedBytesAndCreateSignedUrl(new Uint8Array(event.data.encryptedBytes));
  }
});
```

## Versioning And Compatibility

The editor emits `editor:ready` with its implementation version. Breaking protocol changes require a new major protocol version and documentation page. Protocol v1 events must remain stable within v1.

## Why This Protocol?

The protocol keeps the editor independent from storage providers, identity providers, and application-specific business logic. Any caller that can store encrypted bytes, generate a key in the browser, open an iframe or tab, and listen for `postMessage` can integrate cryptee-editor.

