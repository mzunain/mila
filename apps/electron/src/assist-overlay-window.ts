import { BrowserWindow, screen } from "electron";
import {
  overlayApplyScript,
  overlayDataUrl,
  toOverlayState,
  type AssistStateInput,
  type OverlayState,
} from "./assist-overlay-content";

// The floating coaching overlay: a frameless, always-on-top window that shows
// talking points on top of a live call. Kept as a singleton; visibility is
// driven by the `assistOverlay` preference (tray toggle), content is fed in
// from the web renderer over IPC. See `assist-overlay-content.ts` for the pure
// document/state mapping.

const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 300;
const SCREEN_MARGIN = 16;

let overlay: BrowserWindow | null = null;
let ready = false;
// Last state the renderer pushed, replayed whenever the window (re)opens so a
// toggle never drops the current suggestion.
let lastState: OverlayState = { kind: "idle" };
let onHideRequest: (() => void) | null = null;

/** Called when the user dismisses the overlay from its own × button, so the
 *  owning pref + tray checkbox can be kept in sync. */
export function setAssistOverlayHideHandler(handler: () => void): void {
  onHideRequest = handler;
}

export function isAssistOverlayOpen(): boolean {
  return !!overlay && !overlay.isDestroyed();
}

/** Show or hide the overlay to match the desired enabled state. Idempotent. */
export function applyAssistOverlayEnabled(enabled: boolean): void {
  if (enabled) {
    ensureOverlay();
  } else {
    closeAssistOverlay();
  }
}

/** Ingest a state snapshot forwarded by the renderer. Always cached; only
 *  rendered when the overlay is currently open. */
export function ingestAssistState(input: AssistStateInput): void {
  lastState = toOverlayState(input);
  pushState();
}

export function closeAssistOverlay(): void {
  const win = overlay;
  overlay = null;
  ready = false;
  if (win && !win.isDestroyed()) win.close();
}

function ensureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay;

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    title: "Mila coaching",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  overlay = win;
  ready = false;
  // Float above full-screen call apps and follow the user across Spaces.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  positionOverlay(win);

  win.webContents.on("will-navigate", (event, url) => {
    if (!isHideUrl(url)) return;
    event.preventDefault();
    // Dismissing from the overlay flips the owning preference so the tray
    // checkbox and a later restart agree the overlay is off.
    closeAssistOverlay();
    onHideRequest?.();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHideUrl(url)) {
      closeAssistOverlay();
      onHideRequest?.();
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (overlay === win) {
      overlay = null;
      ready = false;
    }
  });

  void win.loadURL(overlayDataUrl()).then(() => {
    if (win.isDestroyed()) return;
    ready = true;
    pushState();
    win.showInactive();
    win.moveTop();
  });

  return win;
}

function pushState(): void {
  if (!overlay || overlay.isDestroyed() || !ready) return;
  void overlay.webContents
    .executeJavaScript(overlayApplyScript(lastState))
    .catch(() => {
      // The window may be tearing down between the ready check and execution;
      // the next open replays `lastState`, so a dropped push is harmless.
    });
}

function positionOverlay(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const bounds = win.getBounds();
  win.setBounds({
    x: Math.round(x + width - bounds.width - SCREEN_MARGIN),
    y: Math.round(y + height - bounds.height - SCREEN_MARGIN),
    width: bounds.width,
    height: bounds.height,
  });
}

function isHideUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "mila-overlay:";
  } catch {
    return false;
  }
}
