#!/usr/bin/env bash
#
# Build and (re)start the API from the current checkout.
#
#   bash deploy/release.sh --first-run   # + runs the seed, + registers PM2 with systemd
#   bash deploy/release.sh               # every deploy after that
#   bash deploy/release.sh --no-pull     # build what's on disk, don't touch git
#
# Deliberately builds ON THE SERVER rather than shipping a dist/ from Windows:
# Prisma downloads a platform-specific query engine (linux-arm64-openssl-3.0.x
# here), so a dist/ + node_modules built on Windows will not run.

set -euo pipefail

APP_ROOT=/opt/sattadhar
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
BACKEND="$APP_DIR/backend"

FIRST_RUN=0
PULL=1
for arg in "$@"; do
  case "$arg" in
    --first-run) FIRST_RUN=1 ;;
    --no-pull)   PULL=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

[ -f "$BACKEND/.env" ] || {
  echo "Missing $BACKEND/.env — copy .env.example and fill it in first (docs/DEPLOYMENT.md, Part D)." >&2
  exit 1
}

if [ "$PULL" -eq 1 ] && [ -d "$APP_DIR/.git" ]; then
  log "Pulling latest code"
  git -C "$APP_DIR" pull --ff-only
fi

cd "$BACKEND"

# devDependencies stay installed on purpose: `prisma` (migrations), `tsc`
# (build) and `tsx` (seed script) all live there.
log "Installing dependencies"
npm ci

log "Generating the Prisma client"
npm run prisma:generate

log "Applying database migrations"
npm run prisma:deploy

log "Compiling TypeScript"
npm run build

if [ "$FIRST_RUN" -eq 1 ]; then
  log "Seeding the admin + sample staff accounts (idempotent)"
  npm run seed
fi

log "Starting under PM2"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
pm2 save

if [ "$FIRST_RUN" -eq 1 ]; then
  log "Registering PM2 to start on boot"
  # Prints a sudo command the first time; run it, then re-run `pm2 save`.
  sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"
  pm2 save
fi

log "Health check"
sleep 2
curl -fsS http://127.0.0.1:4000/health && echo
log "Done — pm2 logs sattadhar-api"
