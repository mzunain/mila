import { BrowserWindow } from "electron";
import {
  decideDisplayMediaResponse,
  loopbackCaptureSupported,
} from "./loopback-capture";

// Wire system-audio loopback into a window's session. Once registered, a
// renderer `navigator.mediaDevices.getDisplayMedia({ audio: true })` resolves
// to the system audio mix (the remote party on a call) via ScreenCaptureKit,
// rather than failing. No-op off macOS / on older Electron, where the renderer
// stays mic-only. See `loopback-capture.ts` for the pure gate + decision.

export function loopbackSupportedHere(): boolean {
  return loopbackCaptureSupported({
    platform: process.platform,
    electronVersion: process.versions.electron,
  });
}

/** Register the display-media handler on the window's session. Returns whether
 *  loopback was enabled (false when unsupported). */
export function enableLoopbackAudioCapture(win: BrowserWindow): boolean {
  if (!loopbackSupportedHere()) return false;

  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    callback(
      decideDisplayMediaResponse({
        supported: true,
        audioRequested: request.audioRequested,
      }),
    );
  });

  return true;
}
