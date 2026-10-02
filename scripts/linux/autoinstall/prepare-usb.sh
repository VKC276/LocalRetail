#!/usr/bin/env bash
# Builds a small "cidata" seed ISO you can place beside the Ubuntu Server ISO
# (Ventoy) or burn/copy onto install media.
#
# Result: scripts/linux/autoinstall/out/localretail-cidata.iso
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out"
STAGE="$OUT/cidata"

if [[ ! -f "$ROOT/user-data" ]]; then
  echo "Saknar user-data" >&2
  exit 1
fi

if grep -q 'REPLACE_WITH_PASSWORD_HASH' "$ROOT/user-data"; then
  echo "Byt REPLACE_WITH_PASSWORD_HASH i user-data först:" >&2
  echo "  bash $ROOT/make-password.sh 'DittLösen'" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE" "$OUT"
cp "$ROOT/user-data" "$STAGE/user-data"
cp "$ROOT/meta-data" "$STAGE/meta-data"
cp "$ROOT/localretail-kiosk-setup.sh" "$STAGE/localretail-kiosk-setup.sh"
cp "$ROOT/localretail-kiosk-setup.service" "$STAGE/localretail-kiosk-setup.service"
cp "$ROOT/open-kiosk.sh" "$STAGE/open-kiosk.sh"
chmod 755 "$STAGE/"*.sh

ISO="$OUT/localretail-cidata.iso"
rm -f "$ISO"

if command -v genisoimage >/dev/null 2>&1; then
  genisoimage -output "$ISO" -volid cidata -joliet -rock "$STAGE"
elif command -v mkisofs >/dev/null 2>&1; then
  mkisofs -output "$ISO" -volid cidata -joliet -rock "$STAGE"
elif command -v xorriso >/dev/null 2>&1; then
  xorriso -as mkisofs -o "$ISO" -V cidata -J -R "$STAGE"
else
  echo "Installera genisoimage, mkisofs eller xorriso." >&2
  echo "Seed-mappen finns klar i: $STAGE" >&2
  echo "Kopiera den till USB som /cidata (user-data + meta-data + skript)." >&2
  exit 0
fi

echo "Skapad: $ISO"
echo
echo "Ventoy:"
echo "  1. Lägg Ubuntu 24.04 Server ISO på Ventoy-USB"
echo "  2. Lägg även $ISO på samma USB"
echo "  3. Boota Ubuntu-ISO:n, välj autoinstall om Ventoy frågar om cidata"
echo
echo "Manuell kernel-parameter (GRUB):"
echo "  autoinstall ds=nocloud;s=/cdrom/cidata/"
