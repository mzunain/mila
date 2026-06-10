# Mila Mobile

Experimental React Native + Expo app for iOS and Android. It shares the Mila
API and `@mila/shared` types with the web app, but it is not part of the v0.1
supported product surface.

Current limitation: recording uploads one audio chunk after stop; it is not a
low-latency live transcription client.

## Stack

- **Expo SDK 52** with the new React Native architecture
- **Expo Router** (`app/` directory)
- **expo-av** for audio capture
- **expo-secure-store** for session token storage
- TypeScript, dark theme matching the web

## Setup

```bash
# from repo root
pnpm install

# from apps/mobile
pnpm start          # launches Metro + dev menu
pnpm ios            # iOS simulator
pnpm android        # Android emulator / device
```

You'll need:

| Platform | Requirement |
| --- | --- |
| iOS | Xcode 16+ and iOS Simulator (Mac only) |
| Android | Android Studio + emulator, or USB device with debugging on |
| Both | Node 20+, pnpm 10+ |

Or, install the **Expo Go** app on your phone and scan the QR code from `pnpm start` — no native toolchain needed during dev.

## Configuring the API

The default API URL lives in `app.json` under `expo.extra.apiBaseUrl`. For local development against your own API:

```bash
# point the app at your local API
export EXPO_PUBLIC_API_URL=http://192.168.1.10:7400
```

Then update `src/lib/api.ts` to read from `process.env.EXPO_PUBLIC_API_URL` if set.

## Building for the stores

Deferred for v0.1. The app is useful for local experiments only until live
chunk streaming and store-ready QA are done. If you still want an experimental
build, use **EAS Build** (Expo's cloud build service).

```bash
# one-time
npx eas-cli login
npx eas-cli build:configure

# production builds
pnpm build:ios       # produces .ipa
pnpm build:android   # produces .aab

# submit to the stores
pnpm submit:ios      # → App Store Connect
pnpm submit:android  # → Play Console
```

Required accounts:

- **Apple Developer Program** ($99/year) for App Store
- **Google Play Console** ($25 one-time) for Play Store
- **EAS account** (free tier is fine)

## Project layout

```
apps/mobile/
├── app/                    # expo-router routes
│   ├── _layout.tsx         # root stack
│   ├── index.tsx           # redirect to (tabs) or login
│   ├── login.tsx           # auth screen
│   ├── record.tsx          # full-screen recording modal
│   ├── session/[id].tsx    # session detail
│   └── (tabs)/             # bottom-tab routes
│       ├── _layout.tsx
│       ├── workspace.tsx   # home / start a meeting
│       ├── sessions.tsx    # session history
│       ├── chat.tsx        # cross-meeting AI chat
│       └── settings.tsx
├── src/
│   ├── lib/
│   │   ├── auth-context.tsx
│   │   └── api.ts
│   └── components/
├── assets/                 # icon, splash, adaptive-icon
├── app.json
└── eas.json
```
