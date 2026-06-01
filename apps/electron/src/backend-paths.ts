import path from 'node:path';

// Pure resolution of the repo's headless autostart script from the Electron app
// path. No fs/electron imports so it stays unit-testable; the caller picks the
// first candidate that actually exists (a packaged .app does not bundle the
// repo, so none will exist there — autostart-from-the-app is a source-run
// affordance).

export const AUTOSTART_SCRIPT_NAME = 'mila-autostart.sh';

/**
 * Candidate absolute paths for scripts/mila-autostart.sh given app.getAppPath().
 * Covers the app dir resolving to apps/electron (dev) or apps/electron/dist
 * (if Electron ever reports the compiled dir).
 */
export function autostartScriptCandidates(appPath: string): string[] {
  return [
    // apps/electron -> repo root
    path.resolve(appPath, '..', '..', 'scripts', AUTOSTART_SCRIPT_NAME),
    // apps/electron/dist -> repo root
    path.resolve(appPath, '..', '..', '..', 'scripts', AUTOSTART_SCRIPT_NAME),
    // app dir already at repo root
    path.resolve(appPath, 'scripts', AUTOSTART_SCRIPT_NAME),
  ];
}
