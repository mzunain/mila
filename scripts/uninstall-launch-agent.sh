#!/usr/bin/env bash
#
# uninstall-launch-agent.sh — remove the MILA backend LaunchAgent.
#
# This stops MILA from auto-starting the backend at login. It does NOT stop any
# containers that are already running — use ./run.sh stop for that.
#
set -Eeuo pipefail

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "macOS only." >&2
  exit 1
}

LABEL="com.mila.backend"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null \
  || launchctl unload "$PLIST_PATH" 2>/dev/null \
  || true

rm -f "$PLIST_PATH"

echo "Removed $LABEL and $PLIST_PATH."
echo "Containers already running are left untouched; stop them with ./run.sh stop."
