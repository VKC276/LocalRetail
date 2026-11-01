#!/usr/bin/env bash
# Installerar endast kortläsar-agenten från VKC Kiosk-repot på Lubuntu-kassan
# (ingen Chromium från Kiosk — Retail öppnas redan via LocalRetail).
#
# Användning:
#   bash scripts/linux/install-card-reader.sh
#   KIOSK_ID=retail KIOSK_TOKEN='...' bash scripts/linux/install-card-reader.sh
set -euo pipefail

KIOSK_REPO="${KIOSK_REPO:-https://github.com/VKC276/Kiosk.git}"
KIOSK_DIR="${KIOSK_DIR:-$HOME/vkc-kiosk}"
KIOSK_ID="${KIOSK_ID:-reception}"
KIOSK_USER="${KIOSK_USER:-${USER}}"

echo "==> Klona/uppdatera Kiosk → $KIOSK_DIR"
if [[ -d "$KIOSK_DIR/.git" ]]; then
  git -C "$KIOSK_DIR" pull --ff-only || true
else
  git clone "$KIOSK_REPO" "$KIOSK_DIR"
fi

echo "==> Installerar agent (SKIP_BROWSER=1)"
sudo KIOSK_USER="$KIOSK_USER" KIOSK_DIR="$KIOSK_DIR" SKIP_BROWSER=1 bash "$KIOSK_DIR/install.sh"

CFG="$KIOSK_DIR/config.json"
if [[ ! -f "$CFG" ]]; then
  echo "Saknar $CFG efter install." >&2
  exit 1
fi

export CFG KIOSK_ID
export KIOSK_TOKEN="${KIOSK_TOKEN:-}"
python3 <<'PY'
import json, os
from pathlib import Path
cfg_path = Path(os.environ["CFG"])
data = json.loads(cfg_path.read_text(encoding="utf-8"))
cf = data.setdefault("CLOUDFLARE", {})
cf["enabled"] = True
cf["apiUrl"] = cf.get("apiUrl") or "https://vkc-kiosk.muddy-rice-38d4.workers.dev"
cf["kioskId"] = os.environ.get("KIOSK_ID") or "reception"
token = (os.environ.get("KIOSK_TOKEN") or "").strip()
if token:
    cf["token"] = token
cfg_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Satt CLOUDFLARE.kioskId={cf['kioskId']!r} i {cfg_path}")
if not cf.get("token") or cf.get("token") == "REPLACE_ME_KIOSK_TOKEN":
    print("OBS: Sätt CLOUDFLARE.token (samma som wrangler secret KIOSK_TOKEN).")
PY

echo
echo "Nasta steg:"
echo "  1. Satt token om den saknas:  nano $CFG"
echo "     (CLOUDFLARE.token = samma som KIOSK_TOKEN pa Workern)"
echo "  2. YAROGNTEC-lasare:  sudo vkc-kiosk setup-reader && sudo reboot"
echo "  3. Konfigurera lasare:  vkc-kiosk configure-reader && vkc-kiosk save-config"
echo "  4. Starta agent:       sudo systemctl enable --now vkc-kiosk"
echo "  5. I WallFlow Kassainstallningar: kiosk-id = $KIOSK_ID"
echo
echo "Retail-webben lyssnar pa samma kiosk-id via WebSocket — blipp syns under Klipp 10 kort."
