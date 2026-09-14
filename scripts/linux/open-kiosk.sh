#!/usr/bin/env bash
set -euo pipefail

URL="${LOCAL_RETAIL_URL:-http://127.0.0.1:8080/?kiosk=1}"

wait_for_server() {
  local i
  for i in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:8080/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Kassaservern svarade inte på port 8080." >&2
  return 1
}

browser() {
  for cmd in chromium-browser chromium google-chrome-stable google-chrome; do
    if command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd"
      return 0
    fi
  done
  return 1
}

if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset s noblank || true
  xset -dpms || true
fi

if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.session idle-delay 0 || true
  gsettings set org.gnome.desktop.screensaver lock-enabled false || true
fi

wait_for_server

BROWSER="$(browser)" || {
  echo "Ingen Chromium/Chrome hittades. Installera chromium-browser." >&2
  exit 1
}

exec "$BROWSER" \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --password-store=basic \
  --incognito \
  --app="$URL" \
  "$URL"
