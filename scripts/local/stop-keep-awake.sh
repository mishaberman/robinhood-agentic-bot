#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="$ROOT/logs/caffeinate.pid"
LABEL="com.codex.robinhood.keepawake"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  PID="$(cat "$PID_FILE")"
  kill "$PID"
  echo "Stopped keep-awake process $PID."
else
  pkill -f '/usr/bin/caffeinate -d -i -s -u' >/dev/null 2>&1 || true
  echo "Stopped keep-awake LaunchAgent if it was running."
fi

rm -f "$PID_FILE"
