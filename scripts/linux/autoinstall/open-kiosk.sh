#!/usr/bin/env bash
# LocalRetail kiosk browser launcher — resilient for GNOME on thin clients.
set -u

URL="${LOCAL_RETAIL_URL:-https://retail.vastervikclimbing.se/?kiosk=1}"
LOG="${HOME:-/tmp}/.localretail-kiosk.log"

exec >>"$LOG" 2>&1
echo "---- $(date -Is) starting kiosk ----"

# Wait until the graphical session is actually up (avoids login crash loops).
for i in $(seq 1 60); do
  if [[ -n "${DISPLAY:-}" ]] || [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
    break
  fi
  sleep 1
done
sleep 5

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

BROWSER="$(browser)" || {
  echo "Ingen Chromium/Chrome hittades."
  exit 1
}

# Prefer X11 backend; Wayland+Chromium kiosk often kills the GNOME session on thin HW.
export GDK_BACKEND="${GDK_BACKEND:-x11}"

echo "Launching: $BROWSER $URL"
exec "$BROWSER" \
  --ozone-platform=x11 \
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
  --disable-gpu \
  --disable-software-rasterizer \
  --incognito \
  "$URL"
