#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$ROOT/logs/caffeinate.pid"
LOG_FILE="$ROOT/logs/caffeinate.log"
LABEL="com.codex.robinhood.keepawake"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$ROOT/logs"
mkdir -p "$HOME/Library/LaunchAgents"

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-d</string>
    <string>-i</string>
    <string>-s</string>
    <string>-u</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
PID="$(pgrep -f '/usr/bin/caffeinate -d -i -s -u' | head -1 || true)"
if [[ -n "$PID" ]]; then
  echo "$PID" >"$PID_FILE"
  echo "Started LaunchAgent keep-awake with PID $PID."
else
  rm -f "$PID_FILE"
  echo "LaunchAgent loaded, but caffeinate PID was not found yet. Check with: pmset -g assertions"
fi
echo "Stop it with: npm run local:stop-awake"
