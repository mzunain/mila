# Mila Browser Extension

Development extension for browser meeting detection and Google Meet caption bridging.

It detects meeting URLs and starts a matching Mila session:

- Google Meet: `meet.google.com`
- Zoom web: `zoom.us`
- Microsoft Teams web: `teams.microsoft.com`
- WhatsApp Web: `web.whatsapp.com`

For Google Meet, it also watches the meeting page for visible caption text and streams those caption lines into Mila through the local WebSocket API. Google Meet captions must be turned on in the meeting UI for this path to produce text.

## Load in Chrome/Chromium

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked.
4. Select `apps/browser-extension`.

## Current Scope

- Detect meeting/call tabs.
- Open Mila with a real `sessionId`.
- Stream Google Meet caption text into the live transcript and notes panel when Meet captions are enabled.
- Use `mockAudio=0` by default.

Tab audio capture is still the next extension-specific task. Native Zoom and WhatsApp desktop calls require the desktop app, not this browser extension.
