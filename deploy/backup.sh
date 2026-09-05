#!/usr/bin/env bash
#
# Nightly backup: Postgres dump + uploaded product images.
#
#   crontab -e
#   15 2 * * * /opt/sattadhar/app/deploy/backup.sh >> /opt/sattadhar/logs/backup.log 2>&1
#
# Reads its settings from backend/.env (BACKUP_DIR, BACKUP_GPG_PASSPHRASE,
# BACKUP_RETENTION_DAYS, RCLONE_REMOTE, DATABASE_URL).
#
# Encryption and off-site copy are both optional and skipped silently if the
# relevant variable is unset — but a backup that only ever lives on the same
# boot volume as the database is not really a backup. Set RCLONE_REMOTE.

set -euo pipefail

APP_ROOT=/opt/sattadhar
ENV_FILE="${ENV_FILE:-$APP_ROOT/app/backend/.env}"
UPLOADS_DIR="${UPLOADS_DIR:-$APP_ROOT/uploads}"

[ -f "$ENV_FILE" ] || { echo "No env file at $ENV_FILE" >&2; exit 1; }

# Read the .env without executing it: only KEY=VALUE lines, quotes stripped.
while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue ;; esac
  value="${value%\"}"; value="${value#\"}"
  export "$key=$value"
done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")

BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

DUMP="$BACKUP_DIR/sattadhar-$STAMP.dump"

echo "[$(date -Is)] starting backup"

# -Fc is the custom format: compressed, and pg_restore can pick single tables
# out of it. DATABASE_URL is passed straight through, so the password never
# appears in the process list as a separate argument.
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"

# Product images are not in the database; a dump alone restores an app whose
# catalogue is full of broken thumbnails.
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
fi

# Optional symmetric encryption — worth it before anything leaves the machine.
if [ -n "${BACKUP_GPG_PASSPHRASE:-}" ] && [ "$BACKUP_GPG_PASSPHRASE" != "replace-me" ]; then
  for f in "$DUMP" "$BACKUP_DIR/uploads-$STAMP.tar.gz"; do
    [ -f "$f" ] || continue
    gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "$BACKUP_GPG_PASSPHRASE" --output "$f.gpg" "$f"
    rm -f "$f"
  done
fi

# Optional off-site copy (rclone config lives in ~/.config/rclone/rclone.conf).
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" \
    --include "*-$STAMP.*" --transfers 2 --retries 3
fi

# Prune locally. If RCLONE_REMOTE is set, prune there too so the off-site copy
# doesn't grow forever.
find "$BACKUP_DIR" -type f -name 'sattadhar-*' -mtime +"$RETENTION" -delete
find "$BACKUP_DIR" -type f -name 'uploads-*'   -mtime +"$RETENTION" -delete
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone delete "$RCLONE_REMOTE" --min-age "${RETENTION}d" || true
fi

echo "[$(date -Is)] backup done — $(ls -1 "$BACKUP_DIR" | wc -l) files, $(du -sh "$BACKUP_DIR" | cut -f1) total"

# ── Restoring ─────────────────────────────────────────────────────────────
#   gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
#       -o restore.dump sattadhar-YYYYmmdd-HHMMSS.dump.gpg
#   pm2 stop sattadhar-api
#   dropdb -U postgres sattadhar && createdb -U postgres -O sattadhar sattadhar
#   pg_restore --no-owner --dbname "$DATABASE_URL" restore.dump
#   pm2 start sattadhar-api
#
# Test this at least once, on a throwaway database, BEFORE you need it.
