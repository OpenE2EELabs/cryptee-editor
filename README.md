# cryptee-editor

An open-source, browser-based, end-to-end encrypted editor for DOCX, XLSX, and PPTX documents. Built on CryptPad's WASM port of ONLYOFFICE.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/OpenE2EELabs/cryptee-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenE2EELabs/cryptee-editor/actions/workflows/ci.yml)
[![Pages](https://github.com/OpenE2EELabs/cryptee-editor/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/OpenE2EELabs/cryptee-editor/actions/workflows/build-and-deploy.yml)
[![Last commit](https://img.shields.io/github/last-commit/OpenE2EELabs/cryptee-editor)](https://github.com/OpenE2EELabs/cryptee-editor/commits/main)

## What Is cryptee-editor?

cryptee-editor is a standalone static web editor for encrypted Office documents. Any application can open it in a tab or iframe, pass an encrypted document URL and client-held key through the URL fragment, and receive encrypted save results through `postMessage`.

It is intentionally generic: storage, identity, permissions, file pickers, and product UI belong to the integrating application. cryptee-editor owns only the browser-side document editing, conversion, encryption, and collaboration transport protocol.

## Why Does This Exist?

Most encrypted storage products have to choose between preserving end-to-end encryption and offering real Office editing. cryptee-editor closes that gap by doing the format conversion and editing in the user's browser. Plaintext document bytes never need to leave the browser.

## Features

- End-to-end encrypted open and save flow with AES-256-GCM.
- Browser-only DOCX, XLSX, and PPTX editing using CryptPad's ONLYOFFICE work.
- Optional real-time collaboration using ChainPad-style encrypted patches.
- No server-side document processing.
- Static-site deployment on GitHub Pages or any HTTPS hosting.
- AGPL-3.0-or-later, with visible source and license notices in the UI.

## Quick Start

```ts
const editor = new URL("https://OpenE2EELabs.github.io/cryptee-editor/");
editor.hash = new URLSearchParams({
  fileUrl: "https://mystorage.example.com/files/mydocument.docx.enc",
  fileKey: base64Aes256Key,
  fileType: "docx",
  callbackOrigin: window.location.origin,
  mode: "edit",
  displayName: "mydocument.docx"
}).toString();

window.open(editor.toString(), "_blank", "noopener");
```

Before building, fetch upstream vendor artifacts:

```sh
./scripts/fetch-vendor.sh
```

## Integration

Read [docs/PROTOCOL.md](docs/PROTOCOL.md) for the protocol and [docs/INTEGRATION-GUIDE.md](docs/INTEGRATION-GUIDE.md) for a practical integration walkthrough.

## Self-Hosting

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for GitHub Pages, static hosting, and relay deployment options.

## Examples

- [Basic HTML](examples/basic-html/) - a static page using a local file picker and Blob URL.
- [React integration](examples/react-integration/) - a reusable React component with mock storage.
- [FakeCloudDrive](examples/cloud-drive-demo/) - a fictional cloud-drive product integration.
- [AcmePortal](examples/docs-portal-demo/) - a fictional enterprise document portal with permissions.

## Used By

- **Pockio** ([mypocketdrive.online](https://mypocketdrive.online/)) — a privacy-focused encrypted cloud storage product that integrates cryptee-editor for E2EE Office editing of stored documents.
- *Your project here — add via PR.*

## How It Works

The parent app encrypts the file, uploads encrypted bytes to any HTTPS-reachable storage, and opens cryptee-editor with the storage URL and key in the URL fragment. cryptee-editor fetches, decrypts, converts, edits, saves, re-encrypts, and returns encrypted bytes to the caller. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

Storage providers, static hosting, and relay operators should not see document plaintext. The integrating app and the user's browser remain inside the trust boundary. See [docs/SECURITY.md](docs/SECURITY.md).

## Built On

- [CryptPad onlyoffice-x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm)
- [CryptPad onlyoffice-editor](https://github.com/cryptpad/onlyoffice-editor)
- [CryptPad ChainPad](https://github.com/cryptpad/chainpad)
- [CryptPad ChainPad server](https://github.com/cryptpad/chainpad-server)
- [CryptPad ChainPad Netflux](https://github.com/cryptpad/chainpad-netflux)
- [CryptPad](https://github.com/cryptpad/cryptpad), used as architectural reference
- [ONLYOFFICE](https://www.onlyoffice.com)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

