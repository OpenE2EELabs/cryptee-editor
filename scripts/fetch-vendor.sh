#!/usr/bin/env bash
set -euo pipefail

# Downloads prebuilt artifacts from:
#   https://github.com/cryptpad/onlyoffice-x2t-wasm
#   https://github.com/cryptpad/onlyoffice-editor
# Both are AGPL-3.0 licensed.
# Their releases are consumed at build time; we do not redistribute them in this repo.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/editor/public/vendor"
DOWNLOAD_DIR="$VENDOR_DIR/.downloads"
FORCE=0

if [[ "${1:-}" == "--force" ]]; then
    FORCE=1
fi

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "error: required command '$1' not found" >&2
        exit 1
    }
}

download_with_api() {
    local repo="$1"
    local asset="$2"
    local out="$3"
    local api="https://api.github.com/repos/$repo/releases/latest"
    local url
    url="$(curl -fsSL "$api" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const r=JSON.parse(s);const a=r.assets.find(x=>x.name===process.argv[1]);if(!a)process.exit(2);console.log(a.browser_download_url);})" "$asset")" || {
        echo "error: could not locate $asset in latest release for $repo" >&2
        exit 1
    }
    curl -fL "$url" -o "$out"
}

download_asset() {
    local repo="$1"
    local asset="$2"
    local out="$3"
    if command -v gh >/dev/null 2>&1; then
        gh release download --repo "$repo" --pattern "$asset" --output "$out" --clobber
    else
        require_cmd curl
        require_cmd node
        download_with_api "$repo" "$asset" "$out"
    fi
}

release_info() {
    local repo="$1"
    local api="https://api.github.com/repos/$repo/releases/latest"
    curl -fsSL "$api" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const r=JSON.parse(s);console.log(`${r.tag_name} ${r.target_commitish} ${r.html_url}`);})"
}

verify_sha512_if_available() {
    local file="$1"
    local checksum_file="$2"
    if [[ ! -s "$checksum_file" ]]; then
        echo "warning: no checksum file found for $file; integrity is unverified." >&2
        echo "warning: manually verify against the upstream repository before production use." >&2
        return
    fi
    local expected
    expected="$(awk '{print $1}' "$checksum_file")"
    local actual
    if command -v sha512sum >/dev/null 2>&1; then
        actual="$(sha512sum "$file" | awk '{print $1}')"
    else
        actual="$(openssl dgst -sha512 -r "$file" | awk '{print $1}')"
    fi
    [[ "$expected" == "$actual" ]] || {
        echo "error: checksum mismatch for $file" >&2
        exit 1
    }
}

extract_zip() {
    local zip="$1"
    local dest="$2"
    rm -rf "$dest"
    mkdir -p "$dest"
    if command -v unzip >/dev/null 2>&1; then
        unzip -q "$zip" -d "$dest"
    else
        require_cmd python3
        python3 - "$zip" "$dest" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    z.extractall(sys.argv[2])
PY
    fi
    printf 'ready\n' > "$dest/cryptee-vendor-ready.txt"
}

mkdir -p "$DOWNLOAD_DIR"

fetch_one() {
    local repo="$1"
    local asset="$2"
    local dest="$3"
    local zip="$DOWNLOAD_DIR/$asset"
    local checksum="$DOWNLOAD_DIR/$asset.sha512"

    if [[ -d "$dest" && "$FORCE" -eq 0 ]]; then
        echo "skip: $dest already exists (use --force to re-download)"
        return
    fi

    echo "fetch: $repo latest release"
    echo "release: $(release_info "$repo")"
    download_asset "$repo" "$asset" "$zip"
    if download_asset "$repo" "$asset.sha512" "$checksum"; then
        verify_sha512_if_available "$zip" "$checksum"
    else
        echo "warning: upstream did not publish $asset.sha512" >&2
    fi
    extract_zip "$zip" "$dest"
}

fetch_one "cryptpad/onlyoffice-x2t-wasm" "x2t.zip" "$VENDOR_DIR/x2t"
fetch_one "cryptpad/onlyoffice-editor" "onlyoffice-editor.zip" "$VENDOR_DIR/onlyoffice-editor"

echo "vendor artifacts ready in $VENDOR_DIR"
