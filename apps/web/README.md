# @mila/web

Next.js app for the Mila meeting workspace and public landing page.

## Responsibilities

- Live meeting workspace, transcript view, notes, action inbox, and on-demand coaching.
- Public landing/download surface.
- WebSocket client for live transcript and notes updates from `@mila/api`.
- Electron-compatible UI that can be bundled into the desktop shell.

## Local Development

Run from the repository root:

```bash
pnpm --filter @mila/web dev
```

The web app listens on `http://localhost:7300`. It expects the API at
`http://localhost:7400` unless overridden by environment variables.

Useful checks:

```bash
pnpm --filter @mila/web lint
pnpm --filter @mila/web typecheck
pnpm --filter @mila/web build
```

For the complete multi-service stack, prefer `./run.sh` from the repository
root so Postgres, Redis, the ASR worker, API, and web app start together.
