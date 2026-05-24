# Deployment

## Option 1: Public Deployment

Use `https://OpenE2EELabs.github.io/cryptee-editor` when public hosting meets your trust requirements.

## Option 2: GitHub Pages From A Fork

Fork the repository, enable GitHub Pages with source set to GitHub Actions, and push to `main`. The workflow fetches upstream vendor artifacts and publishes `editor/dist`.

## Option 3: Static Hosting

Run:

```sh
./scripts/fetch-vendor.sh
cd editor
npm install
npm run build
```

Upload `editor/dist` to any HTTPS static host, including Cloudflare Pages, Netlify, Vercel, S3-compatible object hosting, or Nginx.

## Option 4: Self-Host The Relay

See [../relay/README.md](../relay/README.md). Production users should operate their own relay with logging, monitoring, TLS, and abuse controls.

## Custom Domain On GitHub Pages

Add a `CNAME` file or configure the custom domain in repository settings, then create the required DNS records. Keep HTTPS enforcement enabled.

## COOP And COEP

Some WASM configurations benefit from cross-origin isolation. If required by the upstream artifacts, serve:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

All third-party resources must then send compatible CORS or CORP headers.

