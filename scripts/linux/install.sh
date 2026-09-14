#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
USER_SYSTEMD="$HOME/.config/systemd/user"
AUTOSTART="$HOME/.config/autostart"
NPM="$(command -v npm)"
NODE_DIR="$(dirname "$NPM")"

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js saknas. Installera Node 22, till exempel:" >&2
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -" >&2
    echo "  sudo apt-get install -y nodejs" >&2
    exit 1
  fi
}

need_browser() {
  if command -v chromium-browser >/dev/null 2>&1; then return 0; fi
  if command -v chromium >/dev/null 2>&1; then return 0; fi
  if command -v google-chrome >/dev/null 2>&1; then return 0; fi
  echo "Installerar Chromium för kioskläge..."
  sudo apt-get update
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
}

echo "Installerar LocalRetail från $REPO"

need_node
need_browser

cd "$REPO"
chmod +x "$REPO/scripts/linux/"*.sh
npm install
npm run build

mkdir -p "$USER_SYSTEMD" "$AUTOSTART"

cat > "$USER_SYSTEMD/local-retail.service" <<EOF
[Unit]
Description=LocalRetail kassa och admin
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO
Environment=NODE_ENV=production
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM run serve
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

cat > "$AUTOSTART/local-retail-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LocalRetail kiosk
Comment=Öppnar självbetjäningen i helskärm
Exec=$REPO/scripts/linux/open-kiosk.sh
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

systemctl --user daemon-reload
systemctl --user enable --now local-retail.service
loginctl enable-linger "$USER" >/dev/null 2>&1 || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Klart. Kassan servas på http://${IP:-127.0.0.1}:8080/"
echo "Admin:         http://${IP:-127.0.0.1}:8080/admin"
echo "Pinkod vid första start: 1234"
echo
echo "Vid nästa inloggning/omstart öppnas kassan i kioskläge."
echo "Sätt automatisk inloggning för den här användaren så kiosken startar av sig själv."
