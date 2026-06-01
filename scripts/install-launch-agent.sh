#!/usr/bin/env bash
#
# install-launch-agent.sh — install the macOS LaunchAgent that starts the MILA
# backend stack automatically at login, so the app starts *completely* after a
# restart (not just the desktop shell).
#
# Idempotent: re-running rewrites the plist and reloads the agent. Remove it
# with scripts/uninstall-launch-agent.sh.
#
set -Eeuo pipefail

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "This installer is for macOS only (it uses launchd)." >&2
  exit 1
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.mila.backend"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/mila"
SCRIPT_PATH="$ROOT_DIR/scripts/mila-autostart.sh"
# Re-ensure the stack every 30 min so a crashed runtime self-heals. The script
# is idempotent and a no-op when the stack is already up, so this is cheap.
START_INTERVAL="${MILA_AUTOSTART_INTERVAL:-1800}"
UID_NUM="$(id -u)"

[[ -f "$SCRIPT_PATH" ]] || {
  echo "Cannot find $SCRIPT_PATH" >&2
  exit 1
}

mkdir -p "$PLIST_DIR" "$LOG_DIR"
chmod +x "$SCRIPT_PATH"

cat >"$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$START_INTERVAL</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/autostart.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/autostart.err.log</string>
</dict>
</plist>
PLIST

echo "Wrote $PLIST_PATH"

# Reload via the modern launchctl API, falling back to the legacy one.
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
if launchctl bootstrap "gui/$UID_NUM" "$PLIST_PATH" 2>/dev/null; then
  echo "Loaded $LABEL (launchctl bootstrap)."
elif launchctl load -w "$PLIST_PATH" 2>/dev/null; then
  echo "Loaded $LABEL (launchctl load)."
else
  echo "WARNING: could not auto-load the agent now; it will start at next login." >&2
fi

# Start it once now so the backend comes up without waiting for a reboot.
launchctl kickstart "gui/$UID_NUM/$LABEL" 2>/dev/null || true

cat <<DONE

Done. The MILA backend will now start automatically at login.
  Logs:    $LOG_DIR/autostart.out.log
  Status:  launchctl print gui/$UID_NUM/$LABEL | grep state
  Remove:  scripts/uninstall-launch-agent.sh
DONE
