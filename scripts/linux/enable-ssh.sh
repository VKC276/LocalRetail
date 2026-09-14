#!/usr/bin/env bash
set -euo pipefail

# Aktiverar SSH-server på kassadatorn så den går att nå från nätverket.

echo "Installerar OpenSSH-server..."
sudo apt-get update
sudo apt-get install -y openssh-server

if systemctl list-unit-files ssh.service >/dev/null 2>&1; then
  sudo systemctl enable --now ssh
elif systemctl list-unit-files sshd.service >/dev/null 2>&1; then
  sudo systemctl enable --now sshd
else
  echo "Kunde inte starta ssh-tjänsten." >&2
  exit 1
fi

if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow OpenSSH
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "SSH är igång. Anslut med: ssh $USER@${IP:-IP-ADRESS}"
