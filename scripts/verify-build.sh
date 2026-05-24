#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/fetch-vendor.sh"

cd "$ROOT_DIR/editor"
npm ci
npm run typecheck
npm test
npm run lint
npm run build

test -f "$ROOT_DIR/editor/dist/index.html" || {
    echo "error: editor/dist/index.html missing after build" >&2
    exit 1
}

echo "build verified"

