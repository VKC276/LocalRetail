#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

git pull --ff-only
npm install
npm run build
systemctl --user restart local-retail.service
echo "LocalRetail är uppdaterad."
