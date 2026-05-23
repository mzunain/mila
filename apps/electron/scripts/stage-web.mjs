#!/usr/bin/env node
/**
 * Copy the Next.js standalone output into apps/electron/web so electron-builder
 * can ship a single self-contained bundle. Run after `next build` with
 * `output: 'standalone'` enabled.
 *
 * Layout (resources/web/):
 *   server.js                  ← from .next/standalone/server.js
 *   .next/                     ← from .next/standalone/.next + .next/static
 *   public/                    ← from apps/web/public
 *   node_modules/              ← from .next/standalone/node_modules
 *   apps/web/.next/            ← when monorepo tracing nests output, the standalone
 *                                folder contains apps/web/server.js etc; we flatten it.
 */
import { existsSync, cpSync, rmSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(here, '..');
const repoRoot = path.resolve(electronRoot, '..', '..');
const webRoot = path.join(repoRoot, 'apps', 'web');
const standaloneRoot = path.join(webRoot, '.next', 'standalone');
const staticDir = path.join(webRoot, '.next', 'static');
const publicDir = path.join(webRoot, 'public');
const outRoot = path.join(electronRoot, 'web');

if (!existsSync(standaloneRoot)) {
  console.error(
    `[stage-web] Missing ${standaloneRoot}. Build the web app first with "pnpm --filter @mila/web build" and ensure next.config.ts sets output: 'standalone'.`,
  );
  process.exit(1);
}

console.log(`[stage-web] cleaning ${outRoot}`);
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

console.log(`[stage-web] copying standalone -> ${outRoot}`);
cpSync(standaloneRoot, outRoot, { recursive: true });

// Monorepo tracing nests the runtime under apps/web/ inside standalone.
// Flatten it so server.js sits at outRoot/server.js.
const nested = path.join(outRoot, 'apps', 'web');
if (existsSync(path.join(nested, 'server.js'))) {
  console.log('[stage-web] flattening apps/web/* -> root');
  for (const entry of readdirSync(nested)) {
    const src = path.join(nested, entry);
    const dst = path.join(outRoot, entry);
    rmSync(dst, { recursive: true, force: true });
    renameSync(src, dst);
  }
  rmSync(path.join(outRoot, 'apps'), { recursive: true, force: true });
}

if (existsSync(staticDir)) {
  const dst = path.join(outRoot, '.next', 'static');
  console.log(`[stage-web] copying static assets -> ${dst}`);
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(staticDir, dst, { recursive: true });
}

if (existsSync(publicDir)) {
  const dst = path.join(outRoot, 'public');
  console.log(`[stage-web] copying public -> ${dst}`);
  cpSync(publicDir, dst, { recursive: true });
}

console.log('[stage-web] done.');
