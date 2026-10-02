#!/usr/bin/env bash
# Creates a complete LocalRetail kiosk install USB (Ventoy + Ubuntu + autoinstall).
#
# Usage:
#   sudo bash create-usb.sh /dev/sdX
#   sudo bash create-usb.sh /dev/sdX 'DittLosen'
#
# This ERASES the USB device. Target machine disk is wiped on install too.
#
# On the kiosk PC: boot USB -> pick Ubuntu Server ISO once (or it is the only
# entry under /iso/). GRUB already has autoinstall + nocloud seed baked in —
# no manual "e" edit, no installer dialogs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out"
CACHE="$OUT/cache"

UBUNTU_VERSION="${UBUNTU_VERSION:-24.04.5}"
UBUNTU_ISO_NAME="ubuntu-${UBUNTU_VERSION}-live-server-amd64.iso"
UBUNTU_ISO_URL="${UBUNTU_ISO_URL:-https://releases.ubuntu.com/24.04/${UBUNTU_ISO_NAME}}"
VENTOY_TAG="${VENTOY_TAG:-}"

DISK="${1:-}"
PASSWORD="${2:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

part_path() {
  local disk="$1" num="$2"
  if [[ "$disk" =~ [0-9]$ ]]; then
    echo "${disk}p${num}"
  else
    echo "${disk}${num}"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Saknar kommando: $1"
}

if [[ -z "$DISK" ]]; then
  cat <<EOF >&2
Anvandning: sudo bash $0 /dev/sdX [losenord]

Exempel:
  lsblk
  sudo bash $0 /dev/sda

Raderar ALLT pa USB-enheten. Kraver Linux (t.ex. Pi5) med sudo.
EOF
  exit 1
fi

[[ "$(id -u)" -eq 0 ]] || die "Kor med sudo."
[[ -b "$DISK" ]] || die "$DISK ar inte en block device."
need_cmd curl
need_cmd lsblk
need_cmd mount
need_cmd umount
need_cmd tar
need_cmd python3

ROOT_SRC="$(findmnt -n -o SOURCE / 2>/dev/null || true)"
if [[ -n "$ROOT_SRC" && "$ROOT_SRC" == "$DISK"* ]]; then
  die "$DISK verkar vara systemdisken (/). Avbryter."
fi

info "USB-enhet:"
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL "$DISK"
echo
read -r -p "Radera ALLT pa $DISK och skapa install-USB? Skriv JA: " CONFIRM
[[ "$CONFIRM" == "JA" ]] || die "Avbrutet."

mkdir -p "$OUT" "$CACHE"

info "Losenord"
SUDO_USER_NAME="${SUDO_USER:-}"
run_as_invoker() {
  if [[ -n "$SUDO_USER_NAME" && "$SUDO_USER_NAME" != "root" ]]; then
    sudo -u "$SUDO_USER_NAME" "$@"
  else
    "$@"
  fi
}

if [[ -n "$PASSWORD" ]]; then
  run_as_invoker bash "$ROOT/ensure-password.sh" "$PASSWORD"
else
  if [[ -n "$SUDO_USER_NAME" && "$SUDO_USER_NAME" != "root" ]]; then
    run_as_invoker bash "$ROOT/ensure-password.sh"
  else
    bash "$ROOT/ensure-password.sh"
  fi
fi

# Refresh staged cidata (password already in user-data)
if command -v genisoimage >/dev/null 2>&1 || command -v mkisofs >/dev/null 2>&1 || command -v xorriso >/dev/null 2>&1; then
  run_as_invoker bash "$ROOT/prepare-usb.sh" || true
else
  STAGE="$OUT/cidata"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  cp "$ROOT/user-data" "$STAGE/user-data"
  cp "$ROOT/meta-data" "$STAGE/meta-data"
  cp "$ROOT/localretail-kiosk-setup.sh" "$STAGE/localretail-kiosk-setup.sh"
  cp "$ROOT/localretail-kiosk-setup.service" "$STAGE/localretail-kiosk-setup.service"
  cp "$ROOT/open-kiosk.sh" "$STAGE/open-kiosk.sh"
  chmod 755 "$STAGE/"*.sh
fi

[[ -f "$ROOT/user-data" ]] || die "Saknar user-data"
grep -E '^[[:space:]]*password:[[:space:]]*"?REPLACE_WITH_PASSWORD_HASH"?[[:space:]]*$' "$ROOT/user-data" >/dev/null \
  && die "Password-hash saknas i user-data"

UBUNTU_ISO="$CACHE/$UBUNTU_ISO_NAME"
if [[ -f "$UBUNTU_ISO" ]]; then
  info "Anvander befintlig Ubuntu-ISO: $UBUNTU_ISO"
else
  info "Laddar ner Ubuntu Server $UBUNTU_VERSION (~3-4 GB)..."
  curl -L --fail --progress-bar -o "$UBUNTU_ISO.partial" "$UBUNTU_ISO_URL"
  mv "$UBUNTU_ISO.partial" "$UBUNTU_ISO"
fi

if [[ -z "$VENTOY_TAG" ]]; then
  VENTOY_TAG="$(curl -fsSL https://api.github.com/repos/ventoy/Ventoy/releases/latest | python3 -c 'import sys,json; print(json.load(sys.stdin)["tag_name"])')"
fi
VENTOY_VER="${VENTOY_TAG#v}"
VENTOY_TGZ="$CACHE/ventoy-${VENTOY_VER}-linux.tar.gz"
VENTOY_DIR="$CACHE/ventoy-${VENTOY_VER}"

if [[ ! -d "$VENTOY_DIR" ]]; then
  info "Laddar ner Ventoy $VENTOY_TAG"
  curl -L --fail --progress-bar -o "$VENTOY_TGZ.partial" \
    "https://github.com/ventoy/Ventoy/releases/download/${VENTOY_TAG}/ventoy-${VENTOY_VER}-linux.tar.gz"
  mv "$VENTOY_TGZ.partial" "$VENTOY_TGZ"
  tar -xzf "$VENTOY_TGZ" -C "$CACHE"
fi
[[ -x "$VENTOY_DIR/Ventoy2Disk.sh" ]] || die "Ventoy2Disk.sh saknas i $VENTOY_DIR"

info "Avmonterar partitioner pa $DISK"
while read -r mp; do
  [[ -n "$mp" ]] && umount "$mp" || true
done < <(lsblk -ln -o MOUNTPOINT "$DISK" | awk 'NF')

info "Installerar Ventoy pa $DISK (raderar USB)"
yes | bash "$VENTOY_DIR/Ventoy2Disk.sh" -I -g "$DISK" || \
  bash "$VENTOY_DIR/Ventoy2Disk.sh" -I -g "$DISK"

sleep 2
partprobe "$DISK" 2>/dev/null || true
sleep 1

PART1="$(part_path "$DISK" 1)"
[[ -b "$PART1" ]] || die "Hittar inte partition $PART1 efter Ventoy-install"

MNT="$OUT/mnt-ventoy"
mkdir -p "$MNT"
info "Monterar $PART1"
mount "$PART1" "$MNT"

info "Skriver Ubuntu ISO + Ventoy autoinstall-config"
mkdir -p "$MNT/iso" "$MNT/ventoy/cidata"
cp -v "$UBUNTU_ISO" "$MNT/iso/$UBUNTU_ISO_NAME"

# Seed for cloud-init (path used by GRUB: ds=nocloud;s=/ventoy/cidata/)
cp -v "$ROOT/user-data" "$MNT/ventoy/cidata/user-data"
cp -v "$ROOT/meta-data" "$MNT/ventoy/cidata/meta-data"
cp -v "$ROOT/localretail-kiosk-setup.sh" "$MNT/ventoy/cidata/localretail-kiosk-setup.sh"
cp -v "$ROOT/localretail-kiosk-setup.service" "$MNT/ventoy/cidata/localretail-kiosk-setup.service"
cp -v "$ROOT/open-kiosk.sh" "$MNT/ventoy/cidata/open-kiosk.sh"
chmod 755 "$MNT/ventoy/cidata/"*.sh

# Bake autoinstall into Ubuntu's GRUB (no manual e-edit)
cp -v "$ROOT/ubuntu-server-autoinstall-grub.cfg" "$MNT/ventoy/ubuntu-server-autoinstall-grub.cfg"

# Ventoy: only show /iso, replace grub.cfg inside Ubuntu ISO
cat > "$MNT/ventoy/ventoy.json" <<EOF
{
  "control": [
    { "VTOY_DEFAULT_SEARCH_ROOT": "/iso" },
    { "VTOY_MENU_TIMEOUT": "5" },
    { "VTOY_DEFAULT_MENU_MODE": "0" },
    { "VTOY_LINUX_REMOUNT": "1" }
  ],
  "conf_replace": [
    {
      "iso": "/iso/ubuntu-*-live-server-amd64.iso",
      "org": "/boot/grub/grub.cfg",
      "new": "/ventoy/ubuntu-server-autoinstall-grub.cfg"
    }
  ]
}
EOF

sync
umount "$MNT"
rmdir "$MNT" 2>/dev/null || true

info "Klar."
cat <<EOF

USB ar redo for obevakad install.

Pa kassadatorn:
  1. Boota fran USB
  2. Valj $UBUNTU_ISO_NAME (enda ISO under /iso) — Ventoy timeout ~5s
  3. GRUB bootar autoinstall sjalv (~2s) med:
       autoinstall ds=nocloud;s=/ventoy/cidata/ nomodeset
  4. Installern kor utan dialoger (hela storsta disken raderas)

Ingen manuell GRUB-redigering behovs.

EOF
