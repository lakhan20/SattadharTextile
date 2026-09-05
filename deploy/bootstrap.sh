#!/usr/bin/env bash
#
# One-shot server provisioning for a fresh Oracle Cloud Ubuntu 22.04 instance
# (ARM64 / Ampere A1 or AMD E2.1.Micro — both work, the script detects which).
#
# Installs: Node 20, PostgreSQL 16, Nginx, PM2, cloudflared, and the directory
# layout the app expects. Creates the database role + database. Idempotent —
# safe to re-run.
#
#   ssh ubuntu@<server>
#   git clone <repo> /opt/sattadhar/app        # or scp the repo up
#   bash /opt/sattadhar/app/deploy/bootstrap.sh
#
# Run as the default `ubuntu` user (which has passwordless sudo), not as root.

set -euo pipefail

APP_ROOT=/opt/sattadhar
APP_DIR="$APP_ROOT/app"
DB_NAME=sattadhar
DB_USER=sattadhar

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as the 'ubuntu' user, not root — PM2 and the app run unprivileged." >&2
  exit 1
fi

# ── 0. Basics ────────────────────────────────────────────────────────────
log "Updating package lists"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl ca-certificates gnupg git build-essential ufw \
  iptables-persistent netfilter-persistent gpg rsync

log "Setting timezone to Asia/Kolkata"
sudo timedatectl set-timezone Asia/Kolkata

# A 1 GB E2.1.Micro cannot build the TypeScript project without swap, and even
# on a 12 GB A1 this costs nothing but disk.
if ! sudo swapon --show | grep -q '/swapfile'; then
  log "Creating a 2 GB swap file"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ── 1. Node 20 ───────────────────────────────────────────────────────────
# Expo/Prisma need 20.19.4+; NodeSource's 20.x line is well past that.
if ! have node || [ "$(node -p 'process.versions.node.split(".")[0]')" != "20" ]; then
  log "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
log "Node $(node --version), npm $(npm --version)"

# ── 2. PostgreSQL 16 ─────────────────────────────────────────────────────
# Ubuntu 22.04 ships Postgres 14; the PGDG repo has 16 for arm64 and amd64.
if ! have psql || ! psql --version | grep -q ' 16'; then
  log "Installing PostgreSQL 16 from the PGDG repository"
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-client-16
fi
sudo systemctl enable --now postgresql

# ── 3. Database role + database ──────────────────────────────────────────
# Password comes from $DB_PASSWORD if you set it, otherwise one is generated
# and printed once at the end. Never overwrites an existing role's password.
ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")
if [ "$ROLE_EXISTS" != "1" ]; then
  DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)}"
  log "Creating role '$DB_USER' and database '$DB_NAME'"
  sudo -u postgres psql -qc "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';"
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  GENERATED_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public"
else
  log "Role '$DB_USER' already exists — leaving it and its password alone"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

# ── 4. Nginx + PM2 + cloudflared ─────────────────────────────────────────
log "Installing Nginx"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
sudo systemctl enable --now nginx

if ! have pm2; then
  log "Installing PM2"
  sudo npm install -g pm2@latest
fi

if ! have cloudflared; then
  log "Installing cloudflared"
  ARCH=$(dpkg --print-architecture)   # arm64 on Ampere A1, amd64 on E2.1.Micro
  TMP_DEB=$(mktemp --suffix=.deb)
  curl -fsSL -o "$TMP_DEB" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
fi

# ── 5. Directory layout ──────────────────────────────────────────────────
# Uploads, logs and backups live OUTSIDE the git checkout so that a redeploy
# (git pull / fresh clone) can never delete a product photo or a backup.
log "Creating $APP_ROOT layout"
sudo mkdir -p "$APP_ROOT"/{uploads/products,logs,backups}
sudo chown -R "$USER:$USER" "$APP_ROOT"
chmod 750 "$APP_ROOT/backups"

log "Bootstrap complete"
cat <<EOF

Next steps:
  1. Put the code at $APP_DIR   (git clone, if you haven't already)
  2. Create $APP_DIR/backend/.env  — see docs/DEPLOYMENT.md, Part D
  3. bash $APP_DIR/deploy/release.sh --first-run

EOF

if [ -n "${GENERATED_URL:-}" ]; then
  cat <<EOF
┌─ Save this now. It is printed once and never again. ─────────────────────
│ DATABASE_URL=$GENERATED_URL
└──────────────────────────────────────────────────────────────────────────

EOF
fi
