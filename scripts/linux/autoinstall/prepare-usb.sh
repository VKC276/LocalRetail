#!/usr/bin/env bash
# Builds a small "cidata" seed ISO for Ubuntu autoinstall (Ventoy companion).
# Result: scripts/linux/autoinstall/out/localretail-cidata.iso
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out"
STAGE="$OUT/cidata"

if [[ ! -f "$ROOT/user-data" ]]; then
  echo "Saknar user-data" >&2
  exit 1
fi

bash "$ROOT/ensure-password.sh" "${1:-}"

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
  echo "Installera genisoimage:  sudo apt-get install -y genisoimage" >&2
  echo "Seed-mappen finns klar i: $STAGE" >&2
  exit 1
fi

echo "Skapad: $ISO"
