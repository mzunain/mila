# Mila Desktop

Tauri desktop scaffold for Granola-style native meeting detection and whole-device capture.

## Why Desktop Is Required

The browser cannot capture the whole device, native Zoom audio, WhatsApp desktop calls, or other apps silently. Desktop support is required for:

- Native Zoom/Teams/WhatsApp process detection
- Tray auto-start
- OS microphone capture
- System audio capture with OS permissions
- Offline buffering

## Current Scaffold

- Tauri shell config
- Rust commands for meeting-signal shape
- Web app bridge contract
- Capture strategy notes for macOS/Windows/Linux

## Next Desktop Implementation Tasks

1. Add process/window detection:
   - macOS: active window + bundle identifier
   - Windows: foreground window + process name
   - Linux: active window where desktop environment permits it
2. Add audio capture:
   - Microphone: `cpal`
   - macOS system audio: ScreenCaptureKit or user-installed virtual device
   - Windows system audio: WASAPI loopback
   - Linux system audio: PulseAudio/PipeWire monitor source
3. Stream captured PCM chunks to the Nest WebSocket API.
