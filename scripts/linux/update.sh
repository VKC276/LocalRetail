#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
git pull --ff-only
echo "LocalRetail är uppdaterad. Kassan hämtar ny version från GitHub Pages vid nästa start."
