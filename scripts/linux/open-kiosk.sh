#!/usr/bin/env bash
set -euo pipefail

URL="${LOCAL_RETAIL_URL:-https://retail.vastervikclimbing.se/?kiosk=1}"

browser() {
  for cmd in chromium-browser chromium google-chrome-stable google-chrome; do
    if command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd"
      return 0
    fi
  done
  return 1
}

# Mildare start på tunn klient / Lubuntu
sleep 2

if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset s noblank || true
  xset -dpms || true
fi

BROWSER="$(browser)" || {
  echo "Ingen Chromium/Chrome hittades. Kor: bash scripts/linux/install.sh" >&2
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
  --no-first-run \
  --incognito \
  "$URL"
