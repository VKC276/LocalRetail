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

# Optional but recommended for cidata.img
if ! command -v mkfs.vfat >/dev/null 2>&1; then
  info "Installerar dosfstools (cidata.img)"
  apt-get update -qq && apt-get install -y dosfstools || true
fi

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

# Earlier sudo runs may have left root-owned files in out/ — clean as root first
rm -rf "$OUT/cidata" "$OUT/mnt-ventoy" "$OUT/mnt-cidata" 2>/dev/null || true
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  chown -R "$SUDO_USER:" "$OUT" 2>/dev/null || true
fi

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

# Stage cidata as root (avoids permission fights with out/)
STAGE="$OUT/cidata"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$ROOT/user-data" "$STAGE/user-data"
cp "$ROOT/meta-data" "$STAGE/meta-data"
cp "$ROOT/localretail-kiosk-setup.sh" "$STAGE/localretail-kiosk-setup.sh"
cp "$ROOT/localretail-kiosk-setup.service" "$STAGE/localretail-kiosk-setup.service"
cp "$ROOT/open-kiosk.sh" "$STAGE/open-kiosk.sh"
chmod 755 "$STAGE/"*.sh
# Optional ISO artifact for debugging
if command -v genisoimage >/dev/null 2>&1; then
  genisoimage -output "$OUT/localretail-cidata.iso" -volid cidata -joliet -rock "$STAGE" 2>/dev/null || true
elif command -v xorriso >/dev/null 2>&1; then
  xorriso -as mkisofs -o "$OUT/localretail-cidata.iso" -V cidata -J -R "$STAGE" 2>/dev/null || true
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

# Ventoy must expose EFI/boot partition (usually p2 named VTOYEFI)
PART2="$(part_path "$DISK" 2)"
if [[ ! -b "$PART2" ]]; then
  die "Ventoy verkar inte installerat ratt (saknar partition 2 / VTOYEFI). Kor om create-usb.sh."
fi
info "Ventoy-partitioner OK: $PART1 (data) + $PART2 (EFI)"
lsblk -o NAME,SIZE,LABEL,FSTYPE "$DISK" || true

MNT="$OUT/mnt-ventoy"
mkdir -p "$MNT"
info "Monterar $PART1"
mount "$PART1" "$MNT"

info "Skriver Ubuntu ISO + Ventoy autoinstall-config"
mkdir -p "$MNT/iso" "$MNT/ventoy/cidata" "$MNT/persistence"
cp -v "$UBUNTU_ISO" "$MNT/iso/$UBUNTU_ISO_NAME"

# Seed files on Ventoy partition (ds=nocloud;s=/ventoy/cidata/)
for f in user-data meta-data localretail-kiosk-setup.sh localretail-kiosk-setup.service open-kiosk.sh; do
  cp -v "$ROOT/$f" "$MNT/ventoy/cidata/$f"
done
chmod 755 "$MNT/ventoy/cidata/"*.sh

# Also a FAT image labeled cidata — cloud-init finds it by label if /ventoy path fails
CIDATA_IMG="$MNT/persistence/localretail-cidata.img"
info "Skapar cidata.img (volymetikett cidata)"
if command -v mkfs.vfat >/dev/null 2>&1; then
  dd if=/dev/zero of="$CIDATA_IMG" bs=1M count=8 status=none
  mkfs.vfat -n cidata "$CIDATA_IMG"
  CIDATA_MNT="$OUT/mnt-cidata"
  mkdir -p "$CIDATA_MNT"
  mount -o loop "$CIDATA_IMG" "$CIDATA_MNT"
  cp -v "$MNT/ventoy/cidata/"* "$CIDATA_MNT/"
  sync
  umount "$CIDATA_MNT"
  rmdir "$CIDATA_MNT" 2>/dev/null || true
else
  info "mkfs.vfat saknas (apt install dosfstools) — hoppar over cidata.img"
  rm -f "$CIDATA_IMG"
fi

cp -v "$ROOT/ubuntu-server-autoinstall-grub.cfg" "$MNT/ventoy/ubuntu-server-autoinstall-grub.cfg"

# Ventoy plugins: conf_replace (bake autoinstall) + persistence (cidata.img)
cat > "$MNT/ventoy/ventoy.json" <<EOF
{
  "control": [
    { "VTOY_DEFAULT_SEARCH_ROOT": "/iso" },
    { "VTOY_MENU_TIMEOUT": "3" },
    { "VTOY_DEFAULT_MENU_MODE": "0" },
    { "VTOY_LINUX_REMOUNT": "1" }
  ],
  "conf_replace": [
    {
      "iso": "/iso/ubuntu-*-live-server-amd64.iso",
      "org": "/boot/grub/grub.cfg",
      "new": "/ventoy/ubuntu-server-autoinstall-grub.cfg"
    }
  ],
  "persistence": [
    {
      "image": "/iso/ubuntu-*-live-server-amd64.iso",
      "backend": "/persistence/localretail-cidata.img",
      "autosel": 1,
      "timeout": 1
    }
  ]
}
EOF

# Sanity check — fail loud if seed missing
[[ -f "$MNT/ventoy/cidata/user-data" ]] || die "user-data saknas pa USB"
[[ -f "$MNT/ventoy/ventoy.json" ]] || die "ventoy.json saknas"
grep -q REPLACE_WITH_PASSWORD_HASH "$MNT/ventoy/cidata/user-data" && die "Password-hash saknas i USB user-data"

info "USB-innehall:"
find "$MNT/iso" "$MNT/ventoy" "$MNT/persistence" -type f 2>/dev/null | sed "s|^$MNT||" || true

sync
umount "$MNT"
rmdir "$MNT" 2>/dev/null || true

info "Klar."
cat <<EOF

USB ar redo (lattvikts-Openbox-kiosk, inte GNOME).

Pa kassadatorn:
  1. Boota USB
  2. Valj Ubuntu Server-ISO under /iso
  3. Om Ventoy fragar om persistence: valj localretail-cidata (eller autosel)
  4. GRUB ska visa "Install LocalRetail kiosk (autoinstall)" och starta sjalv
  5. INGA fragor om namn/anvandare — annars ar autoinstall inte aktiv

Om du andå far dialoger: i GRUB tryck e och kontrollera att raden innehåller:
  autoinstall ds=nocloud;s=/ventoy/cidata/

EOF
