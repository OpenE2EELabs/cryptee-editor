# Architecture

```mermaid
flowchart LR
  Browser["User browser"] --> Wrapper["cryptee-editor wrapper"]
  Wrapper --> OO["CryptPad patched ONLYOFFICE editor"]
  Wrapper --> X2T["CryptPad onlyoffice-x2t-wasm"]
  Wrapper --> ChainPad["ChainPad client"]
  ChainPad <--> Relay["Opaque WebSocket relay"]
  Wrapper <--> Storage["Arbitrary HTTPS encrypted storage"]
```

## Open Flow

```mermaid
sequenceDiagram
  participant App as Parent app
  participant Editor as cryptee-editor
  participant Store as HTTPS storage
  App->>Editor: URL fragment with fileUrl, fileKey, callbackOrigin
  Editor->>Store: GET encrypted bytes
  Store-->>Editor: nonce || ciphertext || tag
  Editor->>Editor: AES-256-GCM decrypt
  Editor->>Editor: x2t conversion
  Editor-->>App: editor:document-loaded
```

## Save Flow

```mermaid
sequenceDiagram
  participant App as Parent app
  participant Editor as cryptee-editor
  participant Store as HTTPS storage
  Editor->>Editor: export from editor
  Editor->>Editor: x2t conversion
  Editor->>Editor: AES-256-GCM encrypt
  alt saveUrl provided
    Editor->>Store: PUT encrypted bytes
    Editor-->>App: editor:save-uploaded
  end
  Editor-->>App: editor:saved
```

## Collaboration Flow

```mermaid
sequenceDiagram
  participant A as Browser A
  participant R as Relay
  participant B as Browser B
  A->>A: derive session key from fileKey and sessionId
  B->>B: derive session key from fileKey and sessionId
  A->>R: encrypted opaque patch
  R->>B: encrypted opaque patch
  B->>B: decrypt patch and apply
```

## E2EE Properties

The storage provider receives encrypted files only. The static host serves code but does not receive URL fragments. The relay receives encrypted patches only. The integrating application remains inside the trust boundary because it creates or handles `fileKey`.

## Performance Characteristics

ONLYOFFICE and x2t are large browser workloads. Expect hundreds of megabytes of downloaded vendor artifacts during build and significant runtime memory use for large documents. Production deployments should test expected document sizes on target browsers.

## Browser Compatibility

| Browser | Status |
| --- | --- |
| Chromium 120+ | Target |
| Firefox 120+ | Target |
| Safari 17+ | Target, subject to WASM memory behavior |
| Mobile browsers | Best effort for viewing; editing depends on ONLYOFFICE UI support |

## Upstream References

- https://github.com/cryptpad/onlyoffice-x2t-wasm
- https://github.com/cryptpad/onlyoffice-editor
- https://github.com/cryptpad/chainpad
- https://github.com/cryptpad/cryptpad

