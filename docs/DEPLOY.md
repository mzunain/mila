# Deploying Mila

Mila is shipped as four runtime surfaces:

| Surface | Runtime | Recommended host (free tier) |
| --- | --- | --- |
| Marketing site + web app (`apps/web`) | Next.js 16 server | **Vercel** |
| API (`apps/api`) | NestJS HTTP + WebSocket | **Fly.io** (Hobby) or Render |
| ASR worker (`apps/asr-worker`) | Python + faster-whisper | **HuggingFace Spaces** (CPU) |
| Database | PostgreSQL 16 | **Neon** (free 0.5 GB) |
| Desktop binaries (`apps/electron`) | Mac/Win/Linux installers | **GitHub Releases** |
| Mobile apps (`apps/mobile`) | Expo (React Native) | Experimental; not part of v0.1 release |

This doc covers Vercel for the web. See `docs/ARCHITECTURE.md` for the rest.

## 1. Vercel — web (`apps/web`)

`vercel.json` lives at the **repo root**. Vercel auto-detects the Next.js project in `apps/web` because we set `outputDirectory` and `buildCommand`.

### One-time setup

1. Create a Vercel project:
   ```bash
   cd /Users/myhome/Documents/Projects/MILA
   npx vercel link
   ```
   When prompted, choose **the repo root** as the project directory.

2. Environment variables (Vercel → Project → Settings → Environment Variables):

   | Name | Example | Notes |
   | --- | --- | --- |
   | `MILA_API_INTERNAL_URL` | `https://mila-api.fly.dev` | Public URL of the API |
   | `NEXT_PUBLIC_APP_URL` | `https://mila.app` | Used by share links |
   | `NODE_ENV` | `production` | Set by Vercel automatically |

3. Push a commit. Vercel will build via `pnpm --filter @mila/web build`.

### Manual deploy

```bash
npx vercel --prod
```

### Custom domains

In Vercel → Domains, attach `mila.app` (apex) and `www.mila.app`. Vercel handles the certificate.

### Build is skipped when…

`vercel.json` includes `ignoreCommand`. The build is skipped if neither `apps/web` nor `packages/shared` changed in the diff. This saves quota for API-only or Electron-only commits.

## 2. Fly.io — API (`apps/api`)

Reference only — full setup is in `apps/api/README.md`.

```bash
cd apps/api
fly launch --no-deploy --name mila-api --region iad
fly secrets set DATABASE_URL=... JWT_SECRET=... GOOGLE_API_KEY=...
fly deploy
```

## 3. HuggingFace Spaces — ASR worker

```bash
cd apps/asr-worker
huggingface-cli login
huggingface-cli upload mila/asr-worker .
```

The Space runs `uvicorn main:app --host 0.0.0.0 --port 7860` (default Space port).

## 4. GitHub Releases — desktop binaries

Already handled by `electron-builder` and the GitHub Actions workflow in
`.github/workflows/release-desktop.yml`.

Tag a release:

```bash
git tag v0.1.0 && git push --tags
```

## 5. Mobile apps

Mobile builds use Expo Application Services (EAS), but the current app is an
experimental recorder and is not part of the v0.1 supported product surface.
See `apps/mobile/README.md`.

```bash
cd apps/mobile
eas build --platform ios
eas submit --platform ios

eas build --platform android
eas submit --platform android
```

You will need:
- **Apple Developer Program** ($99/year) for App Store
- **Google Play Console** ($25 one-time) for Play Store
- An **EAS account** (free for hobby use)
