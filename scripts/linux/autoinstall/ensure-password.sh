#!/usr/bin/env bash
# Ensures identity.password in user-data is a real hash (not the placeholder).
# Usage: ensure-password.sh [plaintext-password]
# If no arg and placeholder present: prompt on tty.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
USER_DATA="$ROOT/user-data"
PLACEHOLDER='REPLACE_WITH_PASSWORD_HASH'

if [[ ! -f "$USER_DATA" ]]; then
  echo "Saknar user-data" >&2
  exit 1
fi

if ! grep -E '^[[:space:]]*password:[[:space:]]*"?'"$PLACEHOLDER"'"?[[:space:]]*$' "$USER_DATA" >/dev/null; then
  exit 0
fi

PASS="${1:-}"
if [[ -z "$PASS" ]]; then
  if [[ ! -t 0 ]]; then
    echo "password i user-data ar fortfarande $PLACEHOLDER." >&2
    echo "Kor: bash $ROOT/ensure-password.sh 'DittLosen'" >&2
    exit 1
  fi
  read -r -s -p "Losenord for kiosk-anvandaren: " PASS
  echo
  read -r -s -p "Bekrafta losenord: " PASS2
  echo
  if [[ "$PASS" != "$PASS2" ]]; then
    echo "Losenorden matchar inte." >&2
    exit 1
  fi
fi

if [[ -z "$PASS" ]]; then
  echo "Tomt losenord." >&2
  exit 1
fi

HASH="$(bash "$ROOT/make-password.sh" "$PASS")"
if [[ -z "$HASH" || "$HASH" != '$6$'* ]]; then
  echo "Kunde inte skapa password-hash." >&2
  exit 1
fi

python3 - "$USER_DATA" "$PLACEHOLDER" "$HASH" <<'PY'
import pathlib, sys
path, placeholder, hash_ = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text(encoding="utf-8")
# Strip BOM if present
if text.startswith("\ufeff"):
    text = text[1:]
needle = f'password: "{placeholder}"'
repl = f'password: "{hash_}"'
if needle not in text:
    # allow unquoted placeholder
    needle2 = f"password: {placeholder}"
    repl2 = f'password: "{hash_}"'
    if needle2 not in text:
        sys.exit(f"Hittade inte {needle} i {path}")
    text = text.replace(needle2, repl2, 1)
else:
    text = text.replace(needle, repl, 1)
path.write_text(text, encoding="utf-8")
print(f"Password-hash sparad i {path}")
PY
