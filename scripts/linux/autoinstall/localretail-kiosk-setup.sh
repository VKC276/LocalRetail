#!/usr/bin/env bash
# First-boot setup: LightDM + Openbox kiosk (no GNOME).
set -euo pipefail

MARKER=/var/lib/localretail/kiosk-setup.done
KIOSK_USER="${KIOSK_USER:-kiosk}"
KIOSK_HOME="/home/${KIOSK_USER}"
OPEN_KIOSK=/opt/localretail/bin/open-kiosk.sh

if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  echo "Anvandaren '$KIOSK_USER' finns inte. Kor t.ex. KIOSK_USER=retail ..." >&2
  exit 1
fi

mkdir -p /var/lib/localretail /opt/localretail/bin
chmod 755 /opt/localretail/bin
chmod 755 "$OPEN_KIOSK" 2>/dev/null || true

export DEBIAN_FRONTEND=noninteractive
apt-get update -y || true
apt-get install -y openssh-server xorg openbox lightdm lightdm-gtk-greeter \
  unattended-upgrades x11-xserver-utils unclutter console-setup keyboard-configuration \
  chromium-browser || \
apt-get install -y openssh-server xorg openbox lightdm lightdm-gtk-greeter \
  unattended-upgrades x11-xserver-utils unclutter console-setup keyboard-configuration \
  chromium || true

systemctl enable --now ssh.service 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true

# Svensk tangentbordslayout
printf '%s\n' 'XKBMODEL="pc105"' 'XKBLAYOUT="se"' 'XKBVARIANT=""' 'XKBOPTIONS=""' 'BACKSPACE="guess"' > /etc/default/keyboard
if command -v localectl >/dev/null 2>&1; then
  localectl set-x11-keymap se pc105 "" "" || true
  localectl set-keymap se || true
fi
setupcon --force 2>/dev/null || true
loadkeys se 2>/dev/null || true

mkdir -p /etc/systemd/system/systemd-networkd-wait-online.service.d
printf '%s\n' '[Service]' 'ExecStart=' 'ExecStart=/lib/systemd/systemd-networkd-wait-online --any --timeout=20' 'TimeoutStartSec=25' \
  > /etc/systemd/system/systemd-networkd-wait-online.service.d/override.conf
mkdir -p /etc/systemd/system/NetworkManager-wait-online.service.d
printf '%s\n' '[Service]' 'TimeoutStartSec=20' \
  > /etc/systemd/system/NetworkManager-wait-online.service.d/override.conf
systemctl daemon-reload || true

# LightDM autologin -> Openbox
mkdir -p /etc/lightdm
cat > /etc/lightdm/lightdm.conf <<EOF
[Seat:*]
autologin-user=${KIOSK_USER}
autologin-user-timeout=0
user-session=openbox
greeter-session=lightdm-gtk-greeter
EOF

# Disable GDM if present (avoids fight with LightDM)
systemctl disable gdm3 gdm 2>/dev/null || true
systemctl enable lightdm.service 2>/dev/null || true

# Openbox autostart -> kiosk browser
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 "$KIOSK_HOME/.config/openbox"
cat > "$KIOSK_HOME/.config/openbox/autostart" <<EOF
# LocalRetail kiosk
sleep 3
${OPEN_KIOSK} &
EOF
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.config"

# Also keep XDG autostart as backup
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 "$KIOSK_HOME/.config/autostart"
cat > "$KIOSK_HOME/.config/autostart/local-retail-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LocalRetail kiosk
Exec=/bin/bash -c 'sleep 5; exec ${OPEN_KIOSK}'
X-GNOME-Autostart-enabled=true
Terminal=false
EOF
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.config"

install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 700 "$KIOSK_HOME/.ssh"
touch "$KIOSK_HOME/.ssh/authorized_keys"
chmod 600 "$KIOSK_HOME/.ssh/authorized_keys"
chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.ssh/authorized_keys"

systemctl set-default graphical.target || true

date -Is > "$MARKER"
echo "LocalRetail kiosk setup klart ($(cat "$MARKER"))."
echo "SSH: ssh ${KIOSK_USER}@$(hostname -I 2>/dev/null | awk '{print $1}')"
