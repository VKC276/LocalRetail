#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
USER_SYSTEMD="$HOME/.config/systemd/user"
AUTOSTART="$HOME/.config/autostart"

need_browser() {
  if command -v chromium-browser >/dev/null 2>&1; then return 0; fi
  if command -v chromium >/dev/null 2>&1; then return 0; fi
  if command -v google-chrome >/dev/null 2>&1; then return 0; fi
  echo "Installerar Chromium för kioskläge..."
  sudo apt-get update
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
}

echo "Installerar LocalRetail-kiosk från $REPO"

need_browser
bash "$REPO/scripts/linux/enable-ssh.sh"

chmod +x "$REPO/scripts/linux/"*.sh
mkdir -p "$AUTOSTART"
rm -f "$USER_SYSTEMD/local-retail.service"
systemctl --user disable --now local-retail.service >/dev/null 2>&1 || true

cat > "$AUTOSTART/local-retail-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LocalRetail kiosk
Comment=Öppnar självbetjäningen i helskärm
Exec=$REPO/scripts/linux/open-kiosk.sh
X-GNOME-Autostart-enabled=true
Terminal=false
EOF

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Klart. Kassan öppnas mot GitHub Pages (ingen lokal webserver)."
echo "URL: ${LOCAL_RETAIL_URL:-https://retail.vastervikclimbing.se/?kiosk=1}"
echo "SSH: ssh $USER@${IP:-IP-ADRESS}"
echo
echo "Vid nasta inloggning/omstart oppnas kassan i kiosklage."
echo "Lubuntu autologin (valfritt):"
echo "  sudo mkdir -p /etc/sddm.conf.d"
echo "  echo -e \"[Autologin]\\nUser=$USER\\nSession=lxqt\" | sudo tee /etc/sddm.conf.d/autologin.conf"
echo "Se aven: scripts/linux/README.md"
