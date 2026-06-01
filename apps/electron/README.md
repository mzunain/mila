# @mila/electron

Cross-platform desktop shell for MILA. Wraps the Next.js web app in a signed
Electron container with auto-update, deep linking (`mila://`), a native menu,
a system tray, and preferences storage.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Main process (src/main.ts)                                     │
│  ├─ single-instance lock + open-url handler (deep links)      │
│  ├─ menu / tray / IPC handlers                                 │
│  ├─ auto-updater (electron-updater)                            │
│  └─ in prod: spawns bundled Next.js standalone server          │
│       on a random port → BrowserWindow.loadURL(...)            │
│     in dev:  loads http://localhost:3000/app directly          │
└────────────────────────────────────────────────────────────────┘
         │                            ▲
         │ contextBridge              │
         ▼                            │
┌────────────────────────────────────────────────────────────────┐
│ Preload (src/preload.ts)                                       │
│  exposes window.mila = { getPreferences, openExternal,         │
│     checkForUpdates, onDeepLink, ... } with contextIsolation   │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ Renderer = the @mila/web Next.js app (unchanged)               │
└────────────────────────────────────────────────────────────────┘
```

The API (`@mila/api`) is **not** bundled inside the desktop app. The shell
points at whatever `apiUrl` / `wsUrl` the user configures in preferences
(defaults to `http://localhost:4000` so local dev still works end-to-end).

## Develop

```bash
# from repo root, in two terminals (or just one with the convenience script):
pnpm dev:desktop
```

Under the hood that runs `apps/web` (`next dev`) and waits for it to come up
before launching Electron. The shell loads `http://localhost:3000/app`
directly — the marketing landing at `/` is web-only and never opens inside
the desktop window. Override with `MILA_DEV_URL=…` if you need a different
host. DevTools open automatically (detached).

If you want the API too, start it in a third terminal:

```bash
pnpm dev:api
```

## Build a distributable

```bash
# Build the current OS only:
pnpm dist:desktop

# Or target one OS explicitly:
pnpm dist:desktop:mac
pnpm dist:desktop:win
pnpm dist:desktop:linux

# All three (needs the right tooling on the host — see below):
pnpm dist:desktop:all
```

Artifacts land in `apps/electron/out/`.

### What gets bundled

The `prebundle` script:

1. Cleans `dist/` and `out/`.
2. Compiles main + preload TypeScript → `dist/`.
3. Runs `next build` with `output: 'standalone'`.
4. Stages the standalone runtime into `apps/electron/web/` via
   `scripts/stage-web.mjs` (flattens the monorepo-nested `apps/web/`
   subfolder, copies `.next/static` and `public/`).
5. `electron-builder` then packages `dist/` + `web/` + `assets/`.

## Cross-OS build hosts

| target  | best on                                | also works on               |
| ------- | -------------------------------------- | --------------------------- |
| macOS   | macOS (required for signing/notarize)  | —                           |
| Windows | Windows (signing) or Linux/macOS (unsigned) | Docker `electronuserland/builder:wine` |
| Linux   | Linux                                  | macOS (no `.rpm`), Windows  |

CI: run three matrix jobs (macos-14, windows-2022, ubuntu-22.04), each calling
`pnpm dist:desktop:<os>` and uploading `apps/electron/out/*` as artifacts.

## Code signing

### macOS

Required for distribution outside the Mac App Store; otherwise users see a
Gatekeeper warning. Set these env vars before running `dist:desktop:mac`:

```bash
CSC_LINK="path/to/cert.p12"           # or base64-encoded CSC_LINK
CSC_KEY_PASSWORD="cert-password"
APPLE_ID="dev@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="ABCD123456"
```

Set `mac.notarize: true` in `electron-builder.yml` once an Apple Developer
account is wired in. Entitlements live in `build/entitlements.mac.plist`.

### Windows

EV code-signing cert (or OV with SmartScreen seasoning). Set:

```bash
CSC_LINK="path/to/cert.pfx"
CSC_KEY_PASSWORD="pfx-password"
```

### Linux

No signing required; AppImage/deb/rpm artifacts are unsigned by default.

## Auto-update

`electron-updater` is wired and runs once on launch + every hour, fetching
release manifests from the `publish` target in `electron-builder.yml`
(GitHub Releases by default). For tagged releases:

```bash
GH_TOKEN=ghp_xxx pnpm dist:desktop --publish always
```

The renderer can call `window.mila.checkForUpdates()` to trigger a manual
check.

## Deep links

`mila://` is registered as a protocol handler on all three OSes. When a link
opens the app, the renderer receives it via `window.mila.onDeepLink((url) => …)`.

## Preferences

Stored in `electron-store` (per-user JSON in
`~/Library/Application Support/Mila/preferences.json` and the equivalent
locations on Windows/Linux).

| Key             | Default                                      |
| --------------- | -------------------------------------------- |
| `apiUrl`        | `http://localhost:4000`                      |
| `wsUrl`         | `ws://localhost:4000/meetings/live`          |
| `theme`         | `system`                                     |
| `launchAtLogin` | `false`                                      |
| `startMinimized`| `false`                                      |
| `windowBounds`  | last position + size                         |

## Menu bar schedule

On macOS, Mila reads upcoming Calendar events and shows the next scheduled
meeting in the menu bar, with the next few calls pinned at the top of the tray
menu. Events with a meeting URL open that URL; other events focus Mila. macOS
may ask for Calendar / Automation permission the first time this runs.

## Security notes

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- External `http(s)` links open in the user's default browser, not in-app.
- IPC handlers validate input before invoking shell APIs.
- Embedded server binds to `127.0.0.1` on a random port; not reachable from
  the LAN.

## Replacing the Tauri scaffold

`apps/desktop/` still contains the original Tauri prototype. It's kept around
for the moment but the Electron app is the supported track for distribution.
Once the team is happy with the Electron build, `apps/desktop/` can be
removed.
