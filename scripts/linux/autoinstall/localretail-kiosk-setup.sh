#!/usr/bin/env bash
# First-boot / idempotent setup for LocalRetail kiosk on Ubuntu 24.04.
set -euo pipefail

MARKER=/var/lib/localretail/kiosk-setup.done
# Override on interactive installs: sudo KIOSK_USER=retail /usr/local/sbin/localretail-kiosk-setup.sh
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
apt-get install -y openssh-server chromium-browser unattended-upgrades x11-xserver-utils unclutter gdm3 ubuntu-desktop-minimal || \
  apt-get install -y openssh-server chromium unattended-upgrades x11-xserver-utils unclutter gdm3 ubuntu-desktop-minimal || true

systemctl enable --now ssh.service 2>/dev/null || systemctl enable --now sshd.service 2>/dev/null || true

# Svensk tangentbordslayout: X11 + TTY/konsol
export DEBIAN_FRONTEND=noninteractive
printf '%s\n' 'XKBMODEL="pc105"' 'XKBLAYOUT="se"' 'XKBVARIANT=""' 'XKBOPTIONS=""' 'BACKSPACE="guess"' > /etc/default/keyboard
if command -v localectl >/dev/null 2>&1; then
  localectl set-x11-keymap se pc105 "" "" || true
  localectl set-keymap se || true
fi
setupcon --force 2>/dev/null || true
# Apply for current TTY if possible
loadkeys se 2>/dev/null || true

# GDM autologin + force Xorg (Wayland often crashes with kiosk Chromium on thin clients)
mkdir -p /etc/gdm3
cat > /etc/gdm3/custom.conf <<EOF
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=${KIOSK_USER}
WaylandEnable=false

[security]

[xdmcp]

[chooser]

[debug]
EOF

# Autostart kiosk for the kiosk user (delayed so desktop can finish starting)
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 "$KIOSK_HOME/.config/autostart"
cat > "$KIOSK_HOME/.config/autostart/local-retail-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LocalRetail kiosk
Comment=Oppnar sjalvbetjaningen i helskarm
Exec=/bin/bash -c 'sleep 8; exec ${OPEN_KIOSK}'
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Phase=Application
Terminal=false
NoDisplay=false
EOF
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.config"

# Disable lock screen defaults system-wide for first login (best-effort)
mkdir -p /etc/dconf/db/local.d
cat > /etc/dconf/db/local.d/00-kiosk <<'EOF'
[org/gnome/desktop/screensaver]
lock-enabled=false

[org/gnome/desktop/session]
idle-delay=uint32 0
EOF
dconf update 2>/dev/null || true

# Ensure SSH keys dir exists for remote admin
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 700 "$KIOSK_HOME/.ssh"
touch "$KIOSK_HOME/.ssh/authorized_keys"
chmod 600 "$KIOSK_HOME/.ssh/authorized_keys"
chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.ssh/authorized_keys"

# Graphical target
systemctl set-default graphical.target || true
systemctl enable gdm3.service 2>/dev/null || systemctl enable gdm.service 2>/dev/null || true

date -Is > "$MARKER"
echo "LocalRetail kiosk setup klart ($(cat "$MARKER"))."
echo "SSH: ssh ${KIOSK_USER}@$(hostname -I 2>/dev/null | awk '{print $1}')"
