# Multi-stage build for @mila/api.
# Build context is the repo root (see infra/docker-compose.yml).

FROM node:20-bookworm-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @mila/api... --filter @mila/shared...

FROM deps AS builder
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @mila/shared build
# Generate Prisma Client first — Nest's TypeScript build needs the generated
# types from `@prisma/client` to compile prisma.service.ts.
RUN cd apps/api && pnpm exec prisma generate
RUN pnpm --filter @mila/api exec nest build
RUN pnpm deploy --filter=@mila/api --prod --legacy /out
# Regenerate Prisma Client into the deploy output's node_modules. pnpm deploy
# re-resolves node_modules from the lockfile, dropping the .prisma/ artefacts
# we produced above. Without this the runtime crashes on `require('.prisma/client/default')`.
RUN cd /out && node node_modules/prisma/build/index.js generate

FROM node:20-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/apps/api/package.json ./package.json

EXPOSE 4000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main"]
