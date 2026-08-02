#!/usr/bin/env bash
# Sattadhar Textile — end-to-end smoke test for Module 1 (auth + RBAC).
#
# Runs the full flow against a LIVE server with a seeded database:
#   health · login · bad password · unknown username · 5-attempt lockout ·
#   refresh · /auth/me · logout + jti revocation · STAFF blocked from an
#   ADMIN-only route · admin password reset.
#
# It locks and then unlocks the `meera` account, leaving her password set to
# the value of NEW_PASSWORD below. Run it against a dev database, not the shop's.
#
#   bash scripts/smoke-auth.sh
#   BASE=https://api.example.com bash scripts/smoke-auth.sh

set -u

BASE="${BASE:-http://localhost:4000}"
API="$BASE/api/v1"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMe@123}"
STAFF_USER="${STAFF_USER:-kirti}"
STAFF_PASS="${STAFF_PASS:-Staff@123}"
LOCK_USER="${LOCK_USER:-meera}"
NEW_PASSWORD="${NEW_PASSWORD:-Unlocked@2026}"

pass=0; fail=0
GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'

# call METHOD PATH [JSON_BODY] [BEARER]  → sets $STATUS and $BODY
call() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-sS -o /tmp/sattadhar_body.$$ -w '%{http_code}' -X "$method" "$API$path")
  [ -n "$body" ]  && args+=(-H 'Content-Type: application/json' -d "$body")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  STATUS="$(curl "${args[@]}")"
  BODY="$(cat /tmp/sattadhar_body.$$ 2>/dev/null)"
  rm -f /tmp/sattadhar_body.$$
}

# check LABEL EXPECTED_STATUS EXPECTED_CODE_OR_-
check() {
  local label="$1" want_status="$2" want_code="${3:--}"
  local got_code; got_code="$(printf '%s' "$BODY" | sed -n 's/.*"code":"\([A-Z_]*\)".*/\1/p')"
  if [ "$STATUS" = "$want_status" ] && { [ "$want_code" = "-" ] || [ "$got_code" = "$want_code" ]; }; then
    printf '  %s✓%s %-58s %s%s%s\n' "$GREEN" "$OFF" "$label" "$DIM" "$STATUS ${got_code:-ok}" "$OFF"
    pass=$((pass+1))
  else
    printf '  %s✗%s %-58s %sgot %s %s%s\n' "$RED" "$OFF" "$label" "$RED" "$STATUS" "${got_code:-—}" "$OFF"
    printf '      want %s %s · body: %.200s\n' "$want_status" "$want_code" "$BODY"
    fail=$((fail+1))
  fi
}

jsonField() { printf '%s' "$1" | sed -n "s/.*\"$2\":\"\([^\"]*\)\".*/\1/p"; }

section() { printf '\n%s%s%s\n' "$BOLD" "$1" "$OFF"; }

printf '\n%sSattadhar Textile — auth smoke test%s  %s%s%s\n' "$BOLD" "$OFF" "$DIM" "$BASE" "$OFF"

section '0 · Health'
STATUS="$(curl -sS -o /tmp/sattadhar_body.$$ -w '%{http_code}' "$BASE/health")"; BODY="$(cat /tmp/sattadhar_body.$$)"; rm -f /tmp/sattadhar_body.$$
check 'GET /health is public and reports the database' 200

section '1 · Sign in'
call POST /auth/login "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}"
check 'ADMIN login succeeds' 200
ADMIN_ACCESS="$(jsonField "$BODY" accessToken)"
case "$BODY" in *passwordHash*) check 'response leaks passwordHash' 000 ;; *) printf '  %s✓%s %-58s %s%s%s\n' "$GREEN" "$OFF" 'response contains no password hash' "$DIM" 'clean' "$OFF"; pass=$((pass+1)) ;; esac

call POST /auth/login "{\"username\":\"$STAFF_USER\",\"password\":\"$STAFF_PASS\"}"
check 'STAFF login succeeds' 200
STAFF_ACCESS="$(jsonField "$BODY" accessToken)"
STAFF_REFRESH="$(jsonField "$BODY" refreshToken)"

section '2 · Bad credentials'
call POST /auth/login "{\"username\":\"$STAFF_USER\",\"password\":\"wrong-password\"}"
check 'wrong password is refused' 401 INVALID_CREDENTIALS
WRONG_BODY="$BODY"
call POST /auth/login '{"username":"ghostuser","password":"wrong-password"}'
check 'unknown username is refused' 401 INVALID_CREDENTIALS
if [ "$BODY" = "$WRONG_BODY" ]; then
  printf '  %s✓%s %-58s %s%s%s\n' "$GREEN" "$OFF" 'unknown user and wrong password are indistinguishable' "$DIM" 'identical' "$OFF"; pass=$((pass+1))
else
  printf '  %s✗%s %-58s %sresponses differ%s\n' "$RED" "$OFF" 'unknown user and wrong password are indistinguishable' "$RED" "$OFF"; fail=$((fail+1))
fi
call POST /auth/login '{"username":"ab"}'
check 'malformed body is rejected with field detail' 400 VALIDATION_ERROR

section "3 · Lockout after 5 failures ($LOCK_USER)"
for i in 1 2 3 4; do
  call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"wrong-password\"}"
  check "attempt $i of 5 → still just invalid" 401 INVALID_CREDENTIALS
done
call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"wrong-password\"}"
check 'attempt 5 of 5 → account locked' 423 ACCOUNT_LOCKED
call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"$STAFF_PASS\"}"
check 'correct password is still refused while locked' 423 ACCOUNT_LOCKED

section '4 · Session'
call GET /auth/me '' "$STAFF_ACCESS"
check 'GET /auth/me returns the caller' 200
STAFF_ID="$(jsonField "$BODY" id)"
case "$BODY" in *STAFF*) printf '  %s✓%s %-58s %s%s%s\n' "$GREEN" "$OFF" 'role reported as STAFF' "$DIM" 'ok' "$OFF"; pass=$((pass+1)) ;; *) printf '  %s✗%s %s\n' "$RED" "$OFF" 'role reported as STAFF'; fail=$((fail+1)) ;; esac

call GET /auth/me
check 'GET /auth/me without a token' 401 UNAUTHENTICATED
call GET /auth/me '' 'not.a.real.jwt'
check 'GET /auth/me with a junk token' 401 TOKEN_INVALID

call POST /auth/refresh "{\"refreshToken\":\"$STAFF_REFRESH\"}"
check 'refresh issues a new access token' 200
NEW_ACCESS="$(jsonField "$BODY" accessToken)"
call GET /auth/me '' "$NEW_ACCESS"
check 'the refreshed access token works' 200
call POST /auth/refresh "{\"refreshToken\":\"$NEW_ACCESS\"}"
check 'an access token cannot be used to refresh' 401 TOKEN_INVALID

section '5 · RBAC'
call POST /auth/admin/reset-password "{\"userId\":\"$STAFF_ID\",\"newPassword\":\"Nope@1234\"}" "$STAFF_ACCESS"
check 'STAFF is blocked from the ADMIN-only route' 403 FORBIDDEN
call POST /auth/admin/reset-password "{\"userId\":\"$STAFF_ID\",\"newPassword\":\"Nope@1234\"}"
check 'anonymous gets 401, not 403' 401 UNAUTHENTICATED
call POST /auth/admin/reset-password "{\"userId\":\"$STAFF_ID\",\"newPassword\":\"weak\"}" "$ADMIN_ACCESS"
check 'ADMIN still cannot set a weak password' 400 VALIDATION_ERROR

section '6 · Logout revokes the jti'
call POST /auth/logout '{}' "$STAFF_ACCESS"
check 'logout succeeds' 200
call GET /auth/me '' "$STAFF_ACCESS"
check 'the access token dies immediately' 401 TOKEN_REVOKED
call GET /auth/me '' "$NEW_ACCESS"
check 'the refreshed token from that session dies too' 401 TOKEN_REVOKED
call POST /auth/refresh "{\"refreshToken\":\"$STAFF_REFRESH\"}"
check 'the refresh token is revoked as well' 401 TOKEN_REVOKED

section "7 · ADMIN unlocks $LOCK_USER by resetting the password"
call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"$STAFF_PASS\"}"
LOCKED_ID=''
call GET /auth/me '' "$ADMIN_ACCESS"
ADMIN_ID="$(jsonField "$BODY" id)"
printf '  %s%s%s\n' "$DIM" "looking up $LOCK_USER's id needs a database read — skipping if unavailable" "$OFF"
if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  LOCKED_ID="$(psql "$DATABASE_URL" -tAc "select id from users where username='$LOCK_USER'" 2>/dev/null | tr -d '[:space:]')"
fi
if [ -n "$LOCKED_ID" ]; then
  call POST /auth/admin/reset-password "{\"userId\":\"$LOCKED_ID\",\"newPassword\":\"$NEW_PASSWORD\"}" "$ADMIN_ACCESS"
  check 'ADMIN resets the password' 200
  call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"$NEW_PASSWORD\"}"
  check 'the reset cleared the lock and the new password works' 200
  call POST /auth/login "{\"username\":\"$LOCK_USER\",\"password\":\"$STAFF_PASS\"}"
  check 'the old password no longer works' 401 INVALID_CREDENTIALS
else
  printf '  %s· set DATABASE_URL and put psql on PATH to run the reset checks%s\n' "$DIM" "$OFF"
  printf '  %s  or run step 11 in requests.http with the id from: select id,username from users;%s\n' "$DIM" "$OFF"
fi

section 'Result'
printf '  %s%d passed%s' "$GREEN" "$pass" "$OFF"
[ "$fail" -gt 0 ] && printf ', %s%d failed%s' "$RED" "$fail" "$OFF"
printf '\n\n'
[ "$fail" -eq 0 ]
