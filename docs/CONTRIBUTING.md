# Contributing

## Development Setup

Install Node.js 20 LTS. Fetch vendor artifacts when testing the full editor runtime:

```sh
./scripts/fetch-vendor.sh
cd editor
npm install
npm run dev
```

## Coding Style

Prettier and ESLint are authoritative. Run:

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
```

## Pull Requests

Keep changes focused, document protocol changes in `docs/PROTOCOL.md`, and add tests for protocol or cryptography behavior.

## DCO

Contributions require a Developer Certificate of Origin sign-off:

```text
Signed-off-by: Your Name <you@example.com>
```

## Updating Vendor Artifacts

Use the exact upstream repositories:

- https://github.com/cryptpad/onlyoffice-x2t-wasm
- https://github.com/cryptpad/onlyoffice-editor

Run `scripts/fetch-vendor.sh --force`, verify checksums, and test open/save flows.

## Bug Reports And Security Issues

Use public issues for ordinary bugs. Use private disclosure for security-sensitive reports.

