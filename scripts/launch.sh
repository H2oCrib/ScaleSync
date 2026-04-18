#!/bin/bash
# ScaleSync launcher — starts the Vite dev server (if not running) and opens
# the app in a chromeless Chrome window. Invoked by the .app bundle and can
# also be run directly from a terminal.

set -e

APP_DIR="/Users/h2ocrib/Desktop/OHAUSE SCALE APP"
PORT=5173
URL="http://localhost:${PORT}"
LOG_DIR="${HOME}/Library/Logs/ScaleSync"
LOG_FILE="${LOG_DIR}/dev-server.log"
PID_FILE="${LOG_DIR}/dev-server.pid"

mkdir -p "${LOG_DIR}"

# Ensure PATH picks up Homebrew-installed node (often /opt/homebrew/bin or
# /usr/local/bin) and nvm's current node. .app bundles launch with a minimal
# PATH so we pre-seed it here.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nvm/versions/node/$(ls -1 ${HOME}/.nvm/versions/node 2>/dev/null | tail -1)/bin:${PATH}"

cd "${APP_DIR}"

is_server_up() {
  curl -s --max-time 1 -o /dev/null "${URL}" && return 0 || return 1
}

# Start the dev server if it isn't already responding on :5173.
if ! is_server_up; then
  echo "[scalesync] starting dev server..." >> "${LOG_FILE}"
  # nohup + & + disown so the server outlives this script.
  nohup npm run dev >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  disown || true

  # Wait up to ~30s for Vite to come online.
  for _ in $(seq 1 60); do
    if is_server_up; then
      break
    fi
    sleep 0.5
  done

  if ! is_server_up; then
    osascript -e 'display alert "ScaleSync couldn'"'"'t start the dev server. Check ~/Library/Logs/ScaleSync/dev-server.log for details."' || true
    exit 1
  fi
fi

# Pick a Chromium-family browser for chromeless app-mode; fall back to Safari.
CHROME="/Applications/Google Chrome.app"
EDGE="/Applications/Microsoft Edge.app"
BRAVE="/Applications/Brave Browser.app"

if [ -d "${CHROME}" ]; then
  open -na "Google Chrome" --args --app="${URL}" --start-fullscreen
elif [ -d "${EDGE}" ]; then
  open -na "Microsoft Edge" --args --app="${URL}" --start-fullscreen
elif [ -d "${BRAVE}" ]; then
  open -na "Brave Browser" --args --app="${URL}" --start-fullscreen
else
  # Fallback: default browser (Safari). No chromeless mode; ask user to go
  # full-screen manually via Cmd+Ctrl+F.
  open "${URL}"
fi
