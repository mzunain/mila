# Mila Browser Extension

Experimental extension for browser meeting detection and Google Meet caption
bridging. It is not part of the v0.1 supported product surface.

Current limitation: the local API is authenticated, but this extension still has
old unauthenticated bridge code and retired local ports. Do not rely on it until
it uses the logged-in Mila web session safely.

Intended scope:

- Google Meet: `meet.google.com`
- Zoom web: `zoom.us`
- Microsoft Teams web: `teams.microsoft.com`
- WhatsApp Web: `web.whatsapp.com`

For Google Meet, it is intended to watch visible caption text and forward those
caption lines into Mila. Google Meet captions must be turned on in the meeting
UI for this path to produce text.

## Load in Chrome/Chromium

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked.
4. Select `apps/browser-extension`.

## Current Scope

- Detect meeting/call tabs.
- Open Mila from a detected meeting.
- Forward Google Meet caption text after the authenticated bridge is fixed.

Tab audio capture is still the next extension-specific task. Native Zoom and
WhatsApp desktop calls require the desktop app, not this browser extension.
