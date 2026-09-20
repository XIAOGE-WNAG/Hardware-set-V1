#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
if command -v sqlite3 >/dev/null 2>&1 && [ -f data/app.db ]; then sqlite3 data/app.db ".backup 'backups/app-$stamp.db'"; else cp data/app.db "backups/app-$stamp.db"; fi
if [ -d public/uploads ]; then tar -czf "backups/uploads-$stamp.tar.gz" public/uploads; fi
find backups -type f -name 'app-*.db' -mtime +30 -delete
find backups -type f -name 'uploads-*.tar.gz' -mtime +14 -delete
