# cryptee-editor relay

This is a minimal WebSocket relay for encrypted ChainPad-style patches. It routes opaque binary payloads between clients in the same channel and never sees document plaintext.

Authentication is intentionally out of scope. Integrators control who receives an editor URL, file key, session ID, and relay URL.

## Local Development

```sh
npm install
npm run dev
```

The relay listens on `PORT` or `3000`.

## Configuration

- `PORT`: HTTP/WebSocket port, default `3000`.
- `MAX_PATCH_HISTORY`: recent patches replayed to new clients, default `1000`.
- `CHECKPOINT_DIR`: optional directory for periodic JSON checkpoints.
- `MAX_PAYLOAD_BYTES`: per-message limit, default `256KB`.
- `MAX_CONNECTIONS_PER_IP`: default `50`.

## Deployment Options

- Oracle Cloud Free Tier ARM: run the Docker image behind Caddy or Nginx with TLS.
- Fly.io free allowance: deploy the Dockerfile and set a small VM size.
- Render free: works for demos, but sleeping instances interrupt collaboration.
- A small VPS: run Docker Compose with automatic TLS.
- Cloudflare in front: useful for TLS, caching of health checks, and basic DDoS filtering.

Production integrators should self-host a relay endpoint with monitoring and rate limits tuned for their traffic.

