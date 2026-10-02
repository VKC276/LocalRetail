#!/usr/bin/env bash
# Generate a SHA-512 password hash for autoinstall identity.password
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Användning: $0 'DittLösenord'" >&2
  exit 1
fi

if command -v openssl >/dev/null 2>&1; then
  openssl passwd -6 "$1"
  exit 0
fi

if command -v mkpasswd >/dev/null 2>&1; then
  mkpasswd -m sha-512 "$1"
  exit 0
fi

echo "Saknar openssl eller mkpasswd." >&2
exit 1
