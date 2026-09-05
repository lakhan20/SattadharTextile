# Sattadhar Textile — Deployment & Operations Runbook

The single document for running this app in production. Written for the live deployment, not as a generic template.

| | |
|---|---|
| **Live API** | `https://130.210.50.78.nip.io` |
| **Health check** | `https://130.210.50.78.nip.io/health` |
| **Server** | Oracle Cloud · Ubuntu 22.04 · ARM64 · instance `sattadhar-api` |
| **Public IP** | `130.210.50.78` (ephemeral — see [§5.4](#54-what-happens-if-the-ip-changes)) |
| **App root** | `/opt/sattadhar/app` (git checkout) |
| **Data root** | `/opt/sattadhar/{uploads,logs,backups}` — outside the checkout on purpose |
| **Database** | PostgreSQL 16, local socket, role `sattadhar`, db `sattadhar` |
| **Process manager** | PM2, app name `sattadhar-api`, fork mode, 1 instance |
| **TLS** | Let's Encrypt via certbot, auto-renewing |
| **Repo** | `git@github.com:lakhan20/SattadharTextile.git` |
| **Target cost** | **₹0/month** — see [§4](#4-staying-at-0) |

```
   Android phones (sideloaded APK)
              │  HTTPS
              ▼
   Let's Encrypt TLS  ── certbot, auto-renews every 60 days
              │
              ▼
  ┌──────────────────────────────────────────────┐
  │  Oracle Cloud · Ubuntu 22.04 · ARM64         │
  │                                              │
  │  Nginx :80/:443 ──► Node (PM2) :4000         │
  │       │                    │                 │
  │  /uploads              PostgreSQL 16         │
  │  (static)               (localhost)          │
  └──────────────────────────────────────────────┘
```

**Contents**

1. [First-time deployment, from zero](#1-first-time-deployment-from-zero)
2. [Deploying a change](#2-deploying-a-change)
3. [What to check before every change](#3-what-to-check-before-every-change)
4. [Staying at ₹0](#4-staying-at-0)
5. [Oracle account health and risks](#5-oracle-account-health-and-risks)
6. [Day-to-day server management](#6-day-to-day-server-management)
7. [Backup and restore](#7-backup-and-restore)
8. [Troubleshooting](#8-troubleshooting)
9. [Routine checklists](#9-routine-checklists)
10. [Appendix — every deploy file, in full](#10-appendix--every-deploy-file-in-full)

---

# 1. First-time deployment, from zero

Skip this section if the server is already running — it's here so the whole thing can be rebuilt from nothing. Budget 2–3 hours.

## 1.1 Oracle Cloud console

### Home region
Shown top-right. **Fixed at signup, cannot be changed.** `ap-mumbai-1` / `ap-hyderabad-1` give ~30 ms from Gujarat. Other regions work but add 150–300 ms per call.

### Budget alert — do this first
**Billing & Cost Management → Budgets → Create Budget** → root compartment, amount `1`, alert at `100%` of actual spend, your email.

If that email ever arrives, something non-free is running. See [§4](#4-staying-at-0).

Also: **Identity → My Profile → enable MFA.** This account holds the shop's entire books.

### Network
**Networking → Virtual Cloud Networks → Start VCN Wizard → "Create VCN with Internet Connectivity"** → name `sattadhar-vcn` → accept defaults → Create.

> **Use the wizard, not the plain `Create VCN` button.** They sit next to each other. Plain *Create VCN* makes an empty network with no subnet, no gateway and no route, and an instance launched into it is unreachable.
>
> <details>
> <summary>Recovering from the plain form — four manual steps</summary>
>
> The *Required* field is **IPv4 CIDR Blocks** → `10.0.0.0/16`. Tick **"Use DNS hostnames in this VCN"** (unchangeable later). Then from the VCN detail page:
>
> 1. **Internet Gateways → Create** → `sattadhar-igw`
> 2. **Route Tables → Default Route Table → Add Route Rules** → Target Type **Internet Gateway**, Destination CIDR `0.0.0.0/0`, Target `sattadhar-igw`. *Without this, a "public" subnet is public in name only.*
> 3. **Subnets → Create Subnet** → `sattadhar-public`, **Regional**, CIDR `10.0.0.0/24`, Default Route Table, Subnet Access **Public Subnet**
> 4. **Security Lists → Default Security List** → confirm ingress `0.0.0.0/0` TCP `22`
> </details>

### SSH key (on your Windows laptop)

```powershell
ssh-keygen -t ed25519 -C "sattadhar-oracle" -f "$env:USERPROFILE\.ssh\sattadhar_oracle"
Get-Content "$env:USERPROFILE\.ssh\sattadhar_oracle.pub"
```

Copy the `ssh-ed25519 AAAA...` line. **Back up the private key** (`sattadhar_oracle`, no extension) off the laptop — Oracle cannot reset it.

### Instance
**Compute → Instances → Create instance.** Pick the **shape before the image** — the image list filters by CPU architecture.

| Field | Value |
|---|---|
| Name | `sattadhar-api` |
| Shape | *Change shape* → **Ampere** → `VM.Standard.A1.Flex` → **2 OCPU / 12 GB** |
| Image | *Change image* → **Canonical Ubuntu 22.04** (shows `aarch64`) |
| Networking | `sattadhar-vcn`, the **public** subnet, **Assign public IPv4: Yes** |
| SSH keys | *Paste public keys* → the line from above |
| Boot volume | *Custom size* → **100 GB** |

Confirm the **"Always Free-eligible"** badge before creating.

> **"Out of host capacity"** is common and not your fault. In order: cycle the Availability Domain (note `ap-mumbai-1` and `ap-hyderabad-1` have only **one** AD, so this lever doesn't exist there); drop to **1 OCPU / 6 GB**, which succeeds far more often and runs this app fine; retry at 02:00–06:00 IST; or upgrade to Pay As You Go, which is served capacity ahead of trial accounts while keeping Always Free resources free (see [§5.2](#52-should-you-upgrade-to-pay-as-you-go)). Last resort: `VM.Standard.E2.1.Micro` (1 GB RAM — swap becomes mandatory and builds are slow).

### Connect

```powershell
ssh -i "$env:USERPROFILE\.ssh\sattadhar_oracle" ubuntu@130.210.50.78
```

User is `ubuntu` (not `root`, not `opc`). Optional one-word alias:

```powershell
@"

Host sattadhar
    HostName 130.210.50.78
    User ubuntu
    IdentityFile $env:USERPROFILE\.ssh\sattadhar_oracle
    ServerAliveInterval 60
"@ | Add-Content -Path "$env:USERPROFILE\.ssh\config" -Encoding utf8
```

Then just `ssh sattadhar`.

## 1.2 Code onto the server

The repo is private, so give the server its **own** read-only key. This is a different key from the Oracle login key — mixing them up is the classic mistake.

| Key | Lives on | Pasted into |
|---|---|---|
| `sattadhar_oracle.pub` | your laptop | Oracle console |
| `id_ed25519.pub` | **the server** | GitHub deploy keys |

```bash
ssh-keygen -t ed25519 -C "sattadhar-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Paste that (it ends in `sattadhar-deploy`) into **GitHub → repo → Settings → Deploy keys → Add deploy key**, **write access unchecked**. Verify and clone:

```bash
ssh -T git@github.com          # "Hi lakhan20/SattadharTextile!" = success
sudo mkdir -p /opt/sattadhar
sudo chown -R ubuntu:ubuntu /opt/sattadhar
git clone git@github.com:lakhan20/SattadharTextile.git /opt/sattadhar/app
```

## 1.3 Bootstrap

```bash
bash /opt/sattadhar/app/deploy/bootstrap.sh
```

5–10 minutes. Installs Node 20, PostgreSQL 16 (PGDG repo — Ubuntu 22.04's own package is 14), Nginx, PM2, cloudflared; 2 GB swap; timezone Asia/Kolkata; the `sattadhar` role and database; `/opt/sattadhar/{uploads,logs,backups}`.

It prints the generated `DATABASE_URL` **and** writes it to `~/db-url.txt`.

> Lost it? The password is only recoverable by replacement:
> ```bash
> NEW_PW=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
> sudo -u postgres psql -qc "ALTER ROLE sattadhar WITH PASSWORD '$NEW_PW';"
> (umask 077; echo "postgresql://sattadhar:$NEW_PW@localhost:5432/sattadhar?schema=public" > ~/db-url.txt)
> cat ~/db-url.txt
> ```
> Then update `DATABASE_URL` in `.env` and `pm2 restart sattadhar-api`.

## 1.4 Environment file

**On the server** — `/opt/sattadhar/app/backend/.env`. Not the `backend/.env` on your laptop; that one is local development only and never leaves your machine.

```bash
cd /opt/sattadhar/app/backend
cat > .env <<EOF
NODE_ENV=production
PORT=4000
API_PREFIX=/api/v1
PUBLIC_BASE_URL=https://130.210.50.78.nip.io
CORS_ORIGINS=https://130.210.50.78.nip.io

DATABASE_URL=$(cat ~/db-url.txt)

JWT_ACCESS_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
BCRYPT_ROUNDS=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15

UPLOAD_DIR=/opt/sattadhar/uploads
MAX_UPLOAD_MB=5

SHOP_NAME=Sattadhar Textile
SHOP_STATE=Gujarat
SHOP_GSTIN=CHANGE_ME
SHOP_PHONE=CHANGE_ME
DEFAULT_LANGUAGE=EN
TZ=Asia/Kolkata

SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=CHANGE_ME
SEED_ADMIN_NAME=Shop Owner
SEED_STAFF_PASSWORD=CHANGE_ME

RATE_LIMIT_WINDOW_MIN=15
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20

BACKUP_DIR=/opt/sattadhar/backups
BACKUP_GPG_PASSPHRASE=CHANGE_ME
BACKUP_RETENTION_DAYS=14
EOF
chmod 600 .env
nano .env          # replace the five CHANGE_ME values
grep -c CHANGE_ME .env    # must print 0
rm ~/db-url.txt
```

`SHOP_GSTIN` and `SHOP_PHONE` print on every invoice. `SEED_ADMIN_PASSWORD` is the one you log in with.

`src/config/env.ts` validates all of this at boot and exits with a readable list if anything is missing or too short — a typo fails loudly and immediately, not three screens into the app.

## 1.5 Deploy the API

```bash
bash /opt/sattadhar/app/deploy/release.sh --first-run
```

Installs dependencies, applies migrations, compiles TypeScript, seeds the admin + 3 sample staff, starts PM2, registers it with systemd for boot survival, and health-checks.

> **Why build on the server, never upload `dist/` from Windows?** Prisma ships a platform-specific query engine binary. A `node_modules` built on Windows contains the Windows engine and cannot run on `linux-arm64`.

## 1.6 Nginx

```bash
cd /opt/sattadhar/app
sudo cp deploy/nginx/sattadhar.conf /etc/nginx/sites-available/sattadhar
sudo sed -i "s/server_name _;/server_name 130.210.50.78.nip.io;/" /etc/nginx/sites-available/sattadhar
sudo ln -sf /etc/nginx/sites-available/sattadhar /etc/nginx/sites-enabled/sattadhar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
curl -s localhost/health; echo
```

## 1.7 Open both firewalls

**Oracle has two firewalls.** Opening only one produces a connection that times out with everything on the server working perfectly — the most confusing failure in this whole process.

**A. VCN security list.** Navigate via the subnet so you edit the one actually attached:
**Compute → Instances → `sattadhar-api` → Attached VNICs → the VNIC → its Subnet → Security Lists → the listed one → Add Ingress Rules.**

Two rules — Source Type `CIDR`, Source CIDR `0.0.0.0/0`, IP Protocol `TCP`, **Source Port Range empty**, **Destination Port Range** `80`, then a second with `443`. Stateless unchecked.

> Three ways this goes wrong, all seen in practice: editing the *private* subnet's security list (tell-tale: its SSH rule is scoped to `10.0.0.0/16`, yet you're SSH'd in from home — so it can't be the one governing your instance); putting the port in **Source** Port Range instead of Destination; ticking Stateless.

**B. The instance's iptables.** Oracle's Ubuntu images ship a `REJECT` rule blocking everything but 22. Rules must be **inserted before** it — appending does nothing:

```bash
LINE=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"||$2=="DROP"{print $1; exit}')
sudo iptables -I INPUT "$LINE" -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo iptables -I INPUT "$LINE" -p tcp --dport 80  -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers | head -15
```

The `dpt:80` and `dpt:443` ACCEPT lines must have **lower line numbers** than `REJECT`.

**Verify from your laptop, not the server** (`<public-ip>.nip.io` often won't loop back through Oracle's NAT from inside the VCN):

```powershell
(Test-NetConnection -ComputerName 130.210.50.78 -Port 80).TcpTestSucceeded    # must be True
curl.exe http://130.210.50.78.nip.io/health
```

## 1.8 HTTPS certificate

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 130.210.50.78.nip.io \
  --agree-tos --no-eff-email --redirect -m timepassmails22@gmail.com
sudo certbot renew --dry-run
```

`nip.io` resolves `<anything>.<ip>.nip.io` to that IP, which satisfies Let's Encrypt's HTTP-01 challenge — real HTTPS with no domain purchase. Certbot adds the 443 block, the HTTP→HTTPS redirect, and a renewal timer.

Verify from the laptop:

```powershell
curl.exe https://130.210.50.78.nip.io/health
curl.exe -X POST https://130.210.50.78.nip.io/api/v1/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"WRONG\"}"
```

A `401` on the second is the ideal result — it proves TLS → Nginx → Node → validation → PostgreSQL → password check all work. *(It also burns one of the 5 failed-login attempts; 5 within 15 minutes locks the account.)*

## 1.9 Backups, log rotation, auto-updates

```bash
# Nightly backup at 02:15
crontab -e
```
```cron
15 2 * * * /opt/sattadhar/app/deploy/backup.sh >> /opt/sattadhar/logs/backup.log 2>&1
```

```bash
# Log rotation — without this, Pino's request logs fill the boot volume
sudo npm install -g pm2-logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true

# Unattended security updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades      # choose Yes
```

Then set up off-site backup storage — see [§7](#7-backup-and-restore). **A backup on the same boot volume as the database is not a backup.**

## 1.10 Build the APK

On your laptop. See [§2.4](#24-shipping-a-mobile-change) for the full mobile release process; first time only:

```powershell
cd d:\lakhan\SattadharTextile\mobile
npm install -g eas-cli
eas login
eas init                                             # writes extra.eas.projectId — commit it
eas build --platform android --profile production    # "Generate a new Android Keystore?" → Y
eas credentials                                      # Android → production → Keystore → Download
```

**Back up the keystore immediately.** Android identifies an app by its signing key. Lose it and you can never ship an update to installed phones — every one must uninstall first, wiping saved logins and server settings. Expo cannot recover it; Google cannot recover it.

`buildType: "apk"` in `eas.json` is deliberate — the default for a production profile is AAB, which is a Play Store upload format and **cannot be sideloaded**.

### Installing on a phone
1. Open the build URL, or share the APK over WhatsApp
2. Allow **"Install unknown apps"** for the app doing the opening
3. Play Protect warns about an unrecognised developer → **Install anyway** (normal for sideloaded apps)
4. Log in as `admin`
5. **Test on mobile data, not shop Wi-Fi** — that's the real path staff use, and it's what proves the public HTTPS setup works

If it can't connect: **More → Server settings** → `https://130.210.50.78.nip.io` → **Test connection** → Save. That override beats the compiled-in value and is your escape hatch.

---

# 2. Deploying a change

## 2.1 The normal case — backend code only

```powershell
# Laptop: verify before pushing
cd d:\lakhan\SattadharTextile\backend
npm test
npm run typecheck
git add -A && git commit -m "..." && git push
```

```bash
# Server
ssh sattadhar
bash /opt/sattadhar/app/deploy/release.sh
```

`release.sh` pulls, `npm ci`, regenerates the Prisma client, runs `prisma migrate deploy`, compiles, reloads PM2 with zero downtime, and health-checks. It refuses to start if `.env` is missing.

Verify:
```bash
pm2 status                      # online, restart count didn't spike
curl -s localhost/health; echo
pm2 logs sattadhar-api --lines 30
```

## 2.2 If the change includes a database migration

Migrations are **forward-only in production** — `prisma migrate deploy` never resets or drops data, but a migration you wrote can. Order matters:

```bash
# 1. Back up FIRST, always
bash /opt/sattadhar/app/deploy/backup.sh

# 2. See what will run, before it runs
cd /opt/sattadhar/app && git pull --ff-only
cd backend && npx prisma migrate status

# 3. Deploy
bash /opt/sattadhar/app/deploy/release.sh --no-pull
```

Read the migration SQL before deploying anything containing `DROP COLUMN`, `DROP TABLE`, a `NOT NULL` added to an existing column, or a type narrowing. Those are irreversible against live data.

**Never** run `prisma migrate dev` or `prisma migrate reset` on the server. `dev` rewrites migration history; `reset` drops the database.

## 2.3 If the change adds or renames an environment variable

`src/config/env.ts` validates at boot. A missing required variable means the process exits immediately and PM2 restart-loops.

**Add it to the server's `.env` before running `release.sh`:**

```bash
nano /opt/sattadhar/app/backend/.env
bash /opt/sattadhar/app/deploy/release.sh
```

Changing `.env` alone needs no rebuild, only:
```bash
pm2 restart sattadhar-api
```

Keep `backend/.env.example` updated in the repo whenever you add a variable — it's the only record of what a fresh deploy needs.

## 2.4 Shipping a mobile change

Two paths, and which one you can use depends on what changed:

| Changed | Method | Staff action |
|---|---|---|
| JS/TS, styles, screens only | `eas update` (over-the-air) | reopen the app |
| Native deps, `app.json`, permissions, icons, SDK version | full rebuild + reinstall | install a new APK |

**Over-the-air (JS only):**
```powershell
cd d:\lakhan\SattadharTextile\mobile
eas update --branch production --message "Fix bill total rounding"
```
Phones pick it up on next launch. Nothing to redistribute.

**Full rebuild:** bump **both** fields in `mobile/app.json` — Android refuses to install over an existing app unless `versionCode` increases:

```json
"version": "1.0.1",
"android": { "versionCode": 2 }
```

```powershell
eas build --platform android --profile production
```

Same keystore ⇒ installs cleanly over the old one, keeping all local data.

> If you removed `expo-updates` to eliminate the runtime dependency on Expo's servers, the OTA path is gone and every change needs a rebuild.

## 2.5 Rolling back

**Code** — redeploy the previous commit:
```bash
cd /opt/sattadhar/app
git log --oneline -5
git checkout <previous-commit-sha>
bash deploy/release.sh --no-pull
```
Return to the branch later with `git checkout master`.

**A bad migration** — there is no automatic down-migration. Restore from the backup you took in §2.2, or hand-write a corrective forward migration. This is why the backup step is not optional.

**Mobile OTA** — republish the previous bundle, or `eas update:rollback`.

---

# 3. What to check before every change

## 3.1 Before you push

```powershell
cd backend
npm test          # 42+ tests: auth flow, lockout, jti revocation, RBAC
npm run typecheck
cd ../mobile
npm run typecheck
```

## 3.2 The compatibility rule that bites hardest

**Phones run whatever APK was installed months ago.** They do not update in lockstep with the server. So a backend change must stay compatible with older clients:

- **Safe:** adding an endpoint; adding an *optional* field to a response; adding an optional request field with a default
- **Breaks installed phones:** renaming or removing a response field; making a previously optional request field required; changing a field's type; changing an endpoint path; tightening validation on existing input

If you must break compatibility, ship the new APK to every phone *first*, confirm all of them updated, then deploy the backend.

## 3.3 Change-type checklist

| If the change… | Then also… |
|---|---|
| adds a Prisma model/field | commit the generated migration; back up before deploying |
| adds an env var | update `.env.example` **and** the server's `.env` before `release.sh` |
| changes RBAC or permissions | re-run `npm test` — RBAC rules are pinned by tests for a reason |
| touches `costPrice` or margins | verify STAFF responses still omit it; compute margins server-side from raw Prisma rows, never from a serialized STAFF response |
| changes invoice PDF layout | generate one real bill and open the PDF before calling it done |
| changes an API response shape | check §3.2 — old APKs are still out there |
| adds a native mobile dependency | full APK rebuild, `versionCode` bump, redistribute |
| changes `PUBLIC_BASE_URL` | invoice PDF links embed it — `pm2 restart` after |
| adds a file upload path | confirm it writes under `UPLOAD_DIR` (`/opt/sattadhar/uploads`), outside the git checkout |

## 3.4 Things that must never happen on the server

- `prisma migrate dev` / `prisma migrate reset` — rewrites history / drops data
- Editing files under `/opt/sattadhar/app` directly — the next `git pull --ff-only` will fail or silently lose the edit. Change code on the laptop, push, deploy.
- Uploading `node_modules` or `dist` from Windows — wrong Prisma engine architecture
- Setting `UPLOAD_DIR` inside the git checkout — a redeploy would orphan every product image
- Committing `.env` — it's gitignored; keep it that way

---

# 4. Staying at ₹0

## 4.1 What is actually free, forever

| Resource | Always Free allowance | This deployment uses |
|---|---|---|
| Ampere A1 compute (ARM) | 4 OCPU + 24 GB RAM total | 1 instance, 2 OCPU / 12 GB |
| AMD compute | 2 × `E2.1.Micro` (1 OCPU / 1 GB) | none |
| Block + boot volumes | **200 GB total**, max 2 volumes | 100 GB boot volume |
| Outbound data transfer | 10 TB/month | a rounding error |
| Public IPv4 | 1 per free instance | 1 (ephemeral) |
| Object Storage | 20 GB | none |
| Load Balancer | 1 × 10 Mbps | **none — deliberately** |

Everything in this deployment sits inside those limits with large margins.

## 4.2 What silently starts billing

The trap is that the console will happily let you create billable things, and the trial credits hide the cost for 30 days.

| Don't | Why |
|---|---|
| Create a second compute instance | The A1 allowance is 4 OCPU / 24 GB **total**. A second 2/12 instance exactly exhausts it; anything more bills. |
| Grow storage past 200 GB | Boot + block volumes are counted together. |
| Enable **boot volume backups** in OCI | Block-volume backup storage is *not* Always Free. Use `deploy/backup.sh` (pg_dump) instead — it's better targeted anyway. |
| Create an Autonomous Database | It's Oracle DB, not PostgreSQL — Prisma can't use it, and it consumes a separate allowance. |
| Add a Load Balancer | Unnecessary — one Nginx on one instance. |
| Keep custom images / instance snapshots | They consume the block storage allowance. |
| Create any resource without the **"Always Free-eligible"** badge | That badge is the only reliable signal in the UI. |

## 4.3 Verifying you're at ₹0 — do this monthly

1. **Billing & Cost Management → Cost Analysis** → set the date range to this month. Total should read **0.00**. Group by *Service* if it doesn't, to see what's charging.
2. **Billing & Cost Management → Budgets** → confirm the ₹1 budget alert still exists and points at a mailbox you actually read.
3. **Governance → Limits, Quotas and Usage** → filter to `Compute` → check A1 OCPU usage is 2 of 4 and memory 12 of 24, and `Block Storage` total is ≤ 200 GB.
4. **Compute → Instances** and **Storage → Block Volumes** → confirm nothing exists that you didn't create.

Cost Analysis lags by up to a day, so a brand-new charge may not appear immediately. The budget alert is the faster tripwire.

## 4.4 Cost outside Oracle

| Item | Cost |
|---|---|
| `nip.io` hostname | free |
| Let's Encrypt certificate | free |
| EAS Build | free tier — limited builds/month, queued; enough for occasional releases |
| GitHub private repo | free |
| Google Drive for off-site backups (rclone) | free within 15 GB |
| UptimeRobot monitoring | free tier |

**Total: ₹0/month.** The only thing that would change that is choosing to buy a domain (~₹900/year), which would also remove the IP-change risk in [§5.4](#54-what-happens-if-the-ip-changes).

---

# 5. Oracle account health and risks

## 5.1 Idle instance reclamation — the biggest threat to uptime

**This is the one to take seriously.** Oracle reclaims idle Always Free compute. Their documented criteria: an instance is idle if, over a **7-day period**, *all three* of these hold:

- 95th-percentile CPU utilization **< 10%**
- Network utilization **< 10%**
- Memory utilization **< 10%** (A1 shapes only)

A shop billing API serving 20 staff will trivially satisfy the CPU and network conditions. **Memory is your margin of safety** — all three must be true simultaneously, so keeping memory utilization above 10% (>1.2 GB on a 12 GB instance) keeps the instance out of the idle classification. PostgreSQL's `shared_buffers` is the natural lever, and raising it is good tuning regardless:

```bash
sudo -u postgres psql -c "ALTER SYSTEM SET shared_buffers = '2GB';"
sudo systemctl restart postgresql
free -h                      # confirm used memory is comfortably above 1.2 GB
```

Two things to know honestly: Oracle does not publish exactly how it samples these metrics, and behaviour has varied by region and over time. So treat the above as risk reduction, not a guarantee.

**The reliable fix is [upgrading to Pay As You Go](#52-should-you-upgrade-to-pay-as-you-go) — idle reclamation applies only to Always Free accounts.**

**Either way, monitor.** Point a free [UptimeRobot](https://uptimerobot.com) HTTP monitor at `https://130.210.50.78.nip.io/health`, 5-minute interval, email alerts. You want to learn about an outage from a robot, not from the counter staff mid-sale. And keep backups current ([§7](#7-backup-and-restore)) — a reclaimed instance is survivable; a reclaimed instance with no backup is not.

## 5.2 Should you upgrade to Pay As You Go?

Counter-intuitively, this is often the *safer* option for a business-critical free-tier deployment:

| | Always Free account | Pay As You Go |
|---|---|---|
| Always Free resources | free | **still free** |
| Idle instance reclamation | **yes** | no |
| A1 capacity priority | low | higher |
| Charges if you exceed free limits | can't exceed | **yes — real money** |

With the ₹1 budget alert from §1.1 in place and nothing but Always Free resources running, the practical bill stays ₹0. The risk you take on is that a mistake (an extra instance, a big volume) now costs money instead of being refused.

Given this app runs the shop's books, the uptime argument is strong. It's your call, and it's reversible in the sense that you can delete anything billable.

## 5.3 Trial expiry

The first 30 days are a trial with credits. When it ends, the account drops to Always Free and **anything not Always Free-eligible is stopped, then deleted**. If you followed §1, everything here qualifies and nothing changes.

Check before the trial ends: **Governance → Limits, Quotas and Usage**, and confirm every resource in §4.3 step 4 carries the Always Free badge.

## 5.4 What happens if the IP changes

The API hostname `130.210.50.78.nip.io` contains the IP, and that hostname is compiled into every installed APK.

Your IP is **ephemeral**, which survives reboots and stop/starts. It changes only if the instance is *terminated* or the VNIC is replaced.

> Don't "fix" this by converting to a Reserved IP — in OCI that operation assigns a **different** address, causing the problem now to avoid it later.

**If it does change**, the recovery is:

1. Staff open **More → Server settings**, enter the new URL, **Test connection**, Save. *No rebuild needed* — this is the real safety net, and worth showing every staff member once.
2. Update the server: `server_name` in the Nginx config, `PUBLIC_BASE_URL` and `CORS_ORIGINS` in `.env`, then a new certificate:
   ```bash
   IP=$(curl -s ifconfig.me)
   sudo sed -i "s/^\s*server_name .*/    server_name ${IP}.nip.io;/" /etc/nginx/sites-available/sattadhar
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d "${IP}.nip.io" --agree-tos --no-eff-email --redirect -m timepassmails22@gmail.com
   cd /opt/sattadhar/app/backend
   sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${IP}.nip.io|" .env
   sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${IP}.nip.io|" .env
   pm2 restart sattadhar-api
   ```
3. Update `EXPO_PUBLIC_API_URL` in `mobile/eas.json` and `PRODUCTION_BASE_URL` in `mobile/src/api/config.ts` so future builds are correct.

Buying a domain (~₹900/year) eliminates this entirely.

## 5.5 Other Oracle-side things to watch

| Watch | Where | Why |
|---|---|---|
| Maintenance notices | Console bell icon / **Announcements** | Oracle occasionally schedules host maintenance requiring a reboot |
| Account email | the address on the account | Reclamation warnings, trial expiry and budget alerts all arrive here — check it's one you read |
| Service limits | **Governance → Limits, Quotas and Usage** | Confirms you haven't drifted past a free allowance |
| Region status | [ocistatus.oraclecloud.com](https://ocistatus.oraclecloud.com) | Rules out "is it them or me?" during an outage |

## 5.6 Disaster recovery — rebuilding from nothing

If the instance is lost entirely:

1. Create a new instance (§1.1) — you'll get a new IP
2. §1.2 – §1.9 to rebuild the server
3. Restore the database and uploads from your most recent off-site backup ([§7](#7-backup-and-restore))
4. Follow §5.4 to re-point everything at the new IP
5. Tell staff to update **More → Server settings**

**This is only survivable if off-site backups exist.** That is the single highest-value thing in this document.

---

# 6. Day-to-day server management

## 6.1 Commands

| | |
|---|---|
| `pm2 status` | is it up; watch the restart counter |
| `pm2 logs sattadhar-api` | live logs |
| `pm2 logs sattadhar-api --err --lines 100` | recent errors only |
| `pm2 restart sattadhar-api` | after an `.env` change |
| `pm2 monit` | live CPU / memory |
| `sudo systemctl status nginx` | reverse proxy |
| `sudo systemctl status postgresql` | database |
| `df -h /` | disk — investigate above 80% |
| `free -h` | memory (also relevant to §5.1) |
| `sudo -u postgres psql sattadhar` | database shell |
| `npx tsx scripts/list-users.ts` | who can sign in, and who's locked out |
| `sudo certbot certificates` | certificate expiry dates |
| `bash deploy/backup.sh` | back up right now |

## 6.2 Resetting a forgotten or locked admin password

Passwords are bcrypt-hashed and cannot be read back — only replaced. From `/opt/sattadhar/app/backend`:

```bash
cat > reset-admin.js <<'EOF'
require('dotenv/config');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('usage: node reset-admin.js <username> <newPassword>');
  process.exit(1);
}

prisma.user
  .update({
    where: { username },
    data: {
      passwordHash: bcrypt.hashSync(password, 12),
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: new Date(),
    },
    select: { username: true, role: true },
  })
  .then((u) => console.log(`Password reset for ${u.username} (${u.role})`))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
EOF

node reset-admin.js admin 'NewPassword@123'
rm reset-admin.js
```

Must run from the `backend` directory (that's where `.env` and `node_modules` are). Single-quote the password so the shell doesn't eat `$` or `!`. It also clears the lockout, so it doubles as the unlock after 5 failed attempts.

Note the seed runs only once — editing `SEED_ADMIN_PASSWORD` in `.env` afterwards changes nothing.

## 6.3 Disk pressure

```bash
df -h /
du -sh /opt/sattadhar/* /var/log
sudo journalctl --disk-usage
```

Usual culprits, in order: PM2 logs (fix with `pm2-logrotate`, §1.9), old backups (lower `BACKUP_RETENTION_DAYS`), systemd journal (`sudo journalctl --vacuum-time=14d`), uploaded product images (legitimate — they grow with the catalogue).

## 6.4 Security posture

- SSH key only; password auth is disabled by default on Oracle images
- Only 22, 80 and 443 reachable; PostgreSQL listens on localhost only
- `.env` is `chmod 600`, gitignored, and holds the only plaintext copy of the JWT secrets
- The GitHub deploy key is read-only — a compromised server can't push code
- Unattended security upgrades enabled (§1.9)
- App-level: helmet, CORS pinned to the API origin, rate limiting, 5-attempt lockout, bcrypt cost 12, JWT access+refresh with `jti` revocation

Rotating the JWT secrets logs everyone out — occasionally worth doing:
```bash
cd /opt/sattadhar/app/backend
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 48)|" .env
pm2 restart sattadhar-api
```

---

# 7. Backup and restore

## 7.1 What runs

`deploy/backup.sh`, nightly at 02:15 via cron:
1. `pg_dump --format=custom` of the whole database
2. `tar -czf` of `/opt/sattadhar/uploads` — product images aren't in the database, and a dump alone restores a catalogue full of broken thumbnails
3. GPG symmetric encryption with `BACKUP_GPG_PASSPHRASE`
4. Optional `rclone` copy off-site
5. Prunes past `BACKUP_RETENTION_DAYS` (14), locally and off-site

## 7.2 Off-site — not optional

Backups sitting on the same boot volume as the database do nothing for the failure modes that matter (instance reclaimed, volume lost, account suspended).

```bash
sudo apt-get install -y rclone
rclone config           # new remote named "offsite", type: drive (Google Drive)
```

Then in `backend/.env`:
```ini
RCLONE_REMOTE=offsite:sattadhar-backups
```

Verify:
```bash
bash /opt/sattadhar/app/deploy/backup.sh
rclone ls offsite:sattadhar-backups
```

## 7.3 Restoring

```bash
# Decrypt
gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
    -o restore.dump sattadhar-YYYYmmdd-HHMMSS.dump.gpg

# Replace the database
pm2 stop sattadhar-api
sudo -u postgres dropdb sattadhar
sudo -u postgres createdb -O sattadhar sattadhar
pg_restore --no-owner --dbname "$DATABASE_URL" restore.dump

# Uploads
tar -xzf uploads-YYYYmmdd-HHMMSS.tar.gz -C /opt/sattadhar/

pm2 start sattadhar-api
curl -s localhost/health; echo
```

## 7.4 Test the restore — really

**Do this once, now, before you need it.** Into a throwaway database so nothing live is at risk:

```bash
sudo -u postgres createdb resttest
pg_restore --no-owner --dbname "postgresql://sattadhar:PASSWORD@localhost:5432/resttest" restore.dump
psql "postgresql://sattadhar:PASSWORD@localhost:5432/resttest" -c "SELECT count(*) FROM bills;"
sudo -u postgres dropdb resttest
```

An untested backup is a guess. Every "we had backups" disaster story is really "we had files we'd never tried to restore."

---

# 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Out of host capacity` creating an instance | Free ARM contention | §1.1 — fewer OCPUs, retry off-peak, or PAYG |
| Server up, nothing connects on 80/443 | Only one of Oracle's two firewalls opened | §1.7 — and check you edited the **public** subnet's security list |
| Ports open but still timing out | Port typed in *Source* Port Range, or Stateless ticked | §1.7 — Source Port Range must be empty |
| `ssh -T git@github.com` → `Permission denied (publickey)` | The laptop's Oracle key was pasted as the GitHub deploy key | §1.2 — the deploy key is the **server's** `~/.ssh/id_ed25519.pub`, ending `sattadhar-deploy` |
| `pm2 status` → `errored` after deploy | Missing/short env var | `pm2 logs sattadhar-api` names it; secrets need 32+ chars |
| `Can't reach database server at localhost:5432` | Postgres down, or wrong password | `sudo systemctl status postgresql`; re-check `DATABASE_URL` |
| `PrismaClientInitializationError: query engine not found` | `node_modules` from Windows | `rm -rf node_modules && bash deploy/release.sh` |
| App shows "Network error", browser reaches the API fine | Phone pinned to an old address | **More → Server settings → Test connection** |
| 413 on product image upload | Nginx body limit below multer's | `client_max_body_size` must exceed `MAX_UPLOAD_MB` |
| Invoice PDF links point at `localhost` | `PUBLIC_BASE_URL` still default | Fix in `.env`, `pm2 restart sattadhar-api` |
| Product images 404 after a redeploy | `UPLOAD_DIR` inside the git checkout | Must be `/opt/sattadhar/uploads` and match the Nginx `alias` |
| APK won't install over the old one | `versionCode` not bumped, or different keystore | §2.4; a changed keystore means uninstall first (wipes local data) |
| Login always fails, password is right | 5-attempt lockout | Wait 15 min, or reset via §6.2 |
| Certificate expired | Renewal timer broken | `sudo certbot renew --dry-run`, check `systemctl status certbot.timer` |
| Instance stopped by itself | Idle reclamation | §5.1 |
| `git pull` fails on the server | Files edited directly on the server | `git checkout -- .` then redeploy; never edit in place (§3.4) |
| Everything slow | Disk full or memory pressure | `df -h /`, `free -h`, §6.3 |

---

# 9. Routine checklists

## 9.1 Before going live

- [ ] Budget alert configured; MFA enabled
- [ ] `https://130.210.50.78.nip.io/health` returns JSON from outside the server
- [ ] `PUBLIC_BASE_URL` and `CORS_ORIGINS` are the real HTTPS origin
- [ ] Both JWT secrets are 48-byte random values, different from each other
- [ ] `chmod 600 backend/.env`; `.env` not in git
- [ ] Seeded admin/staff passwords changed from the `.env` defaults
- [ ] `pm2 save` done; app survives `sudo reboot`
- [ ] Backup cron installed **and a restore tested** (§7.4)
- [ ] `RCLONE_REMOTE` set — backups exist somewhere other than this server
- [ ] `pm2-logrotate` installed
- [ ] `certbot renew --dry-run` passes
- [ ] UptimeRobot monitoring `/health`
- [ ] EAS keystore downloaded into a password manager
- [ ] APK installs and logs in on a real phone **over mobile data**
- [ ] Every staff member shown **More → Server settings** once (§5.4)
- [ ] Real `SHOP_GSTIN` and `SHOP_PHONE` — they print on every invoice
- [ ] SSH private key backed up off the laptop

## 9.2 Weekly (2 minutes)

- [ ] `pm2 status` — online, restart count stable
- [ ] `df -h /` — under 80%
- [ ] `tail -20 /opt/sattadhar/logs/backup.log` — last night's backup succeeded

## 9.3 Monthly (10 minutes)

- [ ] **Cost Analysis reads 0.00** (§4.3)
- [ ] Budget alert still exists and points at a live mailbox
- [ ] No unexpected instances or volumes
- [ ] `rclone ls offsite:sattadhar-backups` — off-site copies are landing
- [ ] `sudo certbot certificates` — expiry more than 30 days out
- [ ] `sudo apt-get update && sudo apt-get upgrade` (or confirm unattended-upgrades ran)
- [ ] `free -h` — memory above the §5.1 idle threshold

## 9.4 Quarterly (30 minutes)

- [ ] **Restore a backup into a throwaway database** (§7.4) — the one that actually matters
- [ ] Review staff accounts: `npx tsx scripts/list-users.ts`, deactivate anyone who left
- [ ] Consider rotating JWT secrets (§6.4)
- [ ] Confirm the EAS keystore backup is still where you think it is
- [ ] `sudo reboot` during closed hours, then verify everything comes back — proves `pm2 save` and the systemd units still work

---

# 10. Appendix — every deploy file, in full

The sections above call these scripts by path. They are reproduced here verbatim so **this document alone is enough to rebuild the whole deployment**, even with no access to the repository.

> The copies in the repo are canonical. If you change a script, update it there — this appendix is for disaster recovery, and can drift. Check `git log -- deploy/` if the two disagree.

To recreate them on a server with no repo, `cat > <path> <<'EOF'` … `EOF` each block, then `chmod +x deploy/*.sh`.

## 10.1 `deploy/bootstrap.sh`

Provisions a fresh Ubuntu 22.04 instance. Idempotent — safe to re-run.

```bash
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
  # Also write it to disk: this script prints a lot, and the one line that
  # matters is trivially lost to a scrollback limit or a closed terminal.
  # Recovering otherwise means ALTER ROLE with a fresh password.
  (umask 077; echo "$GENERATED_URL" > "$HOME/db-url.txt")
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
┌─ Database credentials ───────────────────────────────────────────────────
│ DATABASE_URL=$GENERATED_URL
│
│ Also saved to $HOME/db-url.txt — 'cat ~/db-url.txt' to read it again.
│ Delete that file once backend/.env is filled in.
└──────────────────────────────────────────────────────────────────────────

EOF
else
  cat <<'EOF'
The database role already existed, so no new password was generated.
If you no longer have it, set a fresh one:

  NEW_PW=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  sudo -u postgres psql -qc "ALTER ROLE sattadhar WITH PASSWORD '$NEW_PW';"
  (umask 077; echo "postgresql://sattadhar:$NEW_PW@localhost:5432/sattadhar?schema=public" > ~/db-url.txt)
  cat ~/db-url.txt

Then update DATABASE_URL in backend/.env to match.

EOF
fi
```

## 10.2 `deploy/release.sh`

Every deploy, first and subsequent. See [§2](#2-deploying-a-change).

```bash
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
```

## 10.3 `deploy/ecosystem.config.cjs`

PM2 process definition.

```javascript
/**
 * PM2 process definition for the Sattadhar Textile API.
 *
 *   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
 *
 * Single fork-mode instance on purpose, not cluster:
 *   - express-rate-limit uses an in-memory store, so N workers would each
 *     allow the full RATE_LIMIT_MAX and the login lockout would be N× looser.
 *   - One shop, ≤20 staff. A single Node process is nowhere near saturated,
 *     and Postgres connection count stays predictable for Prisma's pool.
 *
 * No `env` block here: src/config/env.ts calls `dotenv/config`, which reads
 * backend/.env relative to process.cwd() — so `cwd` below is what wires the
 * environment in. Keeping secrets in one file (and out of git) beats copying
 * them into a committed config.
 */
module.exports = {
  apps: [
    {
      name: 'sattadhar-api',
      cwd: '/opt/sattadhar/app/backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 2000,
      // The API is small, but a leak shouldn't be able to OOM a 1 GB micro.
      max_memory_restart: '512M',

      // Pino writes structured JSON to stdout; PM2 captures it to these files.
      // logrotate keeps them from filling the boot volume.
      out_file: '/opt/sattadhar/logs/api-out.log',
      error_file: '/opt/sattadhar/logs/api-err.log',
      merge_logs: true,
      time: false, // pino already stamps every line

      kill_timeout: 12000, // server.ts allows itself 10s to drain before exit(1)
      listen_timeout: 10000,
      wait_ready: false,
    },
  ],
};
```

## 10.4 `deploy/nginx/sattadhar.conf`

Reverse proxy. **This is the pre-certbot version** — after §1.8, certbot rewrites the installed copy at `/etc/nginx/sites-available/sattadhar` to add the `listen 443 ssl` block and the HTTP→HTTPS redirect. Don't overwrite the installed file with this one after certbot has run, or you'll drop TLS.

Remember to replace `server_name _;` with `server_name 130.210.50.78.nip.io;`.

```nginx
# Sattadhar Textile API — Nginx reverse proxy.
#
#   sudo cp deploy/nginx/sattadhar.conf /etc/nginx/sites-available/sattadhar
#   sudo ln -sf /etc/nginx/sites-available/sattadhar /etc/nginx/sites-enabled/sattadhar
#   sudo rm -f /etc/nginx/sites-enabled/default
#   sudo nginx -t && sudo systemctl reload nginx
#
# This is the PRE-CERTBOT file: port 80 only, no certificate. Set server_name to
# your hostname, then run certbot (see the block at the bottom) — it rewrites
# the INSTALLED copy under /etc/nginx/sites-available/ to add `listen 443 ssl`
# and an HTTP->HTTPS redirect. Never re-copy this file over the installed one
# afterwards; that would silently drop TLS.
#
# The live deployment terminates TLS here with Let's Encrypt. The alternative —
# a Cloudflare Tunnel, where TLS terminates at Cloudflare's edge and nothing
# inbound is opened at all — is in deploy/cloudflared/config.yml, unused.

upstream sattadhar_api {
    server 127.0.0.1:4000;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name _;

    # MAX_UPLOAD_MB is 5; leave headroom for the multipart envelope. Without
    # this Nginx returns its own 413 before multer can produce a JSON error.
    client_max_body_size 6m;

    # PDF and Excel exports over a shop's mobile data can be slow to generate.
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;

    access_log /var/log/nginx/sattadhar.access.log;
    error_log  /var/log/nginx/sattadhar.error.log warn;

    # Already gzipped by the app's compression() middleware; don't do it twice.
    gzip off;

    # Serve product images straight off disk — never wake Node for a JPEG.
    # Must match UPLOAD_DIR in backend/.env.
    location /uploads/ {
        alias /opt/sattadhar/uploads/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        proxy_pass http://sattadhar_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;

        proxy_buffering off; # keeps PDF streaming responsive
    }

    # Cheap uptime probe that never touches the database or the logs.
    location = /health {
        proxy_pass http://sattadhar_api;
        access_log off;
    }
}

# ── Enabling HTTPS (what the live deployment runs) ────────────────────────
# Requires TCP 80 and 443 open in BOTH the VCN security list AND the instance's
# iptables — Oracle has two firewalls (docs/DEPLOYMENT.md §1.7).
#
#   sudo sed -i "s/server_name _;/server_name <your-public-ip>.nip.io;/" \
#     /etc/nginx/sites-available/sattadhar
#   sudo apt-get install -y certbot python3-certbot-nginx
#   sudo certbot --nginx -d <your-public-ip>.nip.io --agree-tos --redirect -m you@example.com
#
# nip.io resolves <anything>.<ip>.nip.io to that IP, which satisfies Let's
# Encrypt's HTTP-01 challenge — real HTTPS with no domain purchase. The catch:
# the hostname contains the IP, so if the instance ever gets a new public IP,
# every installed APK points at a dead address (docs/DEPLOYMENT.md §5.4).
```

## 10.5 `deploy/backup.sh`

Nightly backup. See [§7](#7-backup-and-restore).

```bash
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
```

## 10.6 `mobile/eas.json`

APK build profiles. `EXPO_PUBLIC_API_URL` is the **origin only** — `src/api/client.ts` appends `/api/v1` itself.

```json
{
  "$schema": "https://raw.githubusercontent.com/expo/eas-cli/main/packages/eas-json/schema.json",
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },

    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    },

    "production": {
      "distribution": "internal",
      "channel": "production",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://130.210.50.78.nip.io"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## 10.7 Not used in this deployment

`deploy/cloudflared/config.yml` exists in the repo for the alternative HTTPS route — a Cloudflare Tunnel with your own domain, which removes the need to open ports 80/443 at all and makes the API address independent of the server's IP. It is **not** in use here; §1.7/§1.8 (nip.io + Let's Encrypt) is the live setup. If you ever buy a domain, that file plus [§5.4](#54-what-happens-if-the-ip-changes) is the migration path.
