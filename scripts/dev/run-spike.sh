#!/usr/bin/env bash
# Runs a browser spike page headlessly and prints its JSON result.
# usage: scripts/dev/run-spike.sh <spike-page.html?query> <result-name> [timeout-s]
# Needs a Chromium browser: set BROWSER_BIN (defaults to Chrome, then Brave, on macOS).
# Start the dev server first:  SPIKE_OUT=$OUT_DIR pnpm --filter @selfnode/web dev --port 5199
set -euo pipefail
OUT_DIR="${SPIKE_OUT:?set SPIKE_OUT to the same directory the dev server writes to}"
BIN="${BROWSER_BIN:-}"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
  [ -z "$BIN" ] && [ -x "$c" ] && BIN="$c"
done
[ -n "$BIN" ] || { echo "No Chromium browser found; set BROWSER_BIN" >&2; exit 1; }
OUT="$OUT_DIR/$2.json"; rm -f "$OUT"
PROFILE="$(mktemp -d)"
"$BIN" --headless=new --user-data-dir="$PROFILE" --no-first-run "http://localhost:5199/spikes/$1" >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 "${3:-300}"); do [ -s "$OUT" ] && break; sleep 1; done
kill "$PID" 2>/dev/null || true; rm -rf "$PROFILE"
[ -s "$OUT" ] && cat "$OUT" || { echo "no result" >&2; exit 1; }
