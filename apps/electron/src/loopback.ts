import { BrowserWindow, desktopCapturer } from "electron";
import {
  decideDisplayMediaResponse,
  loopbackCaptureSupported,
} from "./loopback-capture";

// Wire system-audio loopback into a window's session. Once registered, a
// renderer `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`
// resolves to the system audio mix (the remote party on a call) via
// ScreenCaptureKit, rather than failing. No-op off macOS / on older Electron,
// where the renderer stays mic-only. See `loopback-capture.ts` for the pure
// gate + decision.
//
// Chromium will not *start* a getDisplayMedia capture without a video source,
// even when the caller only wants the system-audio track — answering with
// `{ audio: 'loopback' }` alone aborts with "Error starting capture". So the
// handler hands back the primary screen as the video source too; the renderer
// drops that video track immediately and keeps only the audio. Capturing
// system audio already needs the macOS Screen Recording grant, so attaching the
// screen costs no extra permission. (Verified on Electron 33 / macOS: the audio
// track arrives labelled "System audio" and carries real signal.)

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

  win.webContents.session.setDisplayMediaRequestHandler(
    (request, callback) => {
      const decision = decideDisplayMediaResponse({
        supported: true,
        audioRequested: request.audioRequested,
      });
      if (!decision.audio) {
        // Not granting loopback — cancel so the renderer falls back to mic-only.
        callback({});
        return;
      }
      // Loopback needs a video source attached or Chromium refuses to start.
      desktopCapturer
        .getSources({ types: ["screen"], fetchWindowIcons: false })
        .then((sources) => {
          const screen = sources[0];
          if (!screen) {
            callback({});
            return;
          }
          callback({ video: screen, audio: decision.audio });
        })
        .catch(() => callback({}));
    },
    // Use our own screen source rather than the macOS system picker dialog.
    { useSystemPicker: false },
  );

  return true;
}
