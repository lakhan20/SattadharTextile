# Deployment — Oracle Cloud Always Free

Takes the app from "I just signed into Oracle Cloud" to "the shop's phones are running a signed APK against a live HTTPS API."

Budget about **2–3 hours**, most of it waiting on installs and the EAS build queue.

```
   Android phones (sideloaded APK)
              │  HTTPS
              ▼
     Cloudflare edge  ── free TLS, free DDoS filtering
              │  outbound-only tunnel
              ▼
  ┌──────────────────────────────────────────┐
  │  Oracle Cloud · Ubuntu 22.04 · ARM64     │
  │                                          │
  │  cloudflared → Nginx :80 → Node :4000    │
  │                  │            │          │
  │            /uploads      PostgreSQL 16   │
  │           (product        (localhost)    │
  │            images)                       │
  └──────────────────────────────────────────┘
```

Everything below stays inside the **Always Free** allowance. Running cost: **₹0/month**, plus ~₹900/year if you buy a domain (Part E1). No load balancer, no managed database, no object storage — those are the three things that quietly start billing.

---

## Part A — Oracle Cloud console

You've signed in. Do these five things before touching a terminal.

### A1. Check your home region

Top-right of the console shows your region. **It was fixed at signup and cannot be changed.**

- `ap-mumbai-1` or `ap-hyderabad-1` — ideal, ~30 ms from a phone in Gujarat.
- Anywhere else — it still works. Expect 150–300 ms per API call, which is noticeable on the billing screen but not broken. Not worth deleting the account over.

### A2. Understand what "Always Free" actually covers

Your account is in a **30-day trial with ₹25,000-ish of credits**. When the trial ends the account drops to Always Free, and **anything that isn't Always Free-eligible gets stopped and then deleted.** So the rule for the next 30 days is: if the console doesn't show the green **"Always Free-eligible"** badge next to it, don't create it.

What you get forever:

| Resource | Allowance | What we use |
|---|---|---|
| Ampere A1 compute (ARM) | 4 OCPU + 24 GB RAM total | 1 instance, 2 OCPU / 12 GB |
| AMD compute | 2 × VM.Standard.E2.1.Micro (1 OCPU / 1 GB) | fallback only |
| Block + boot volume | 200 GB total | 100 GB boot volume |
| Outbound data | 10 TB/month | nowhere near it |
| Public IPv4 | 1 per free instance | 1 |

Not free, and easy to click by accident: **Load Balancer** (the 10 Mbps one is free but you don't need it — Cloudflare does this job), **Autonomous Database** (it's Oracle DB, not PostgreSQL — Prisma cannot talk to it), **Object Storage** beyond 20 GB, **any shape without the badge**.

### A3. Set a budget alert (5 minutes, prevents a bad surprise)

**Billing & Cost Management → Budgets → Create Budget** → target the root compartment, amount `1`, alert at `100%` of actual spend, your email. If you ever get that mail, something non-free is running and you have days to find it, not a month.

While you're in the account: **Identity → My Profile → enable MFA.** This account is about to hold your shop's entire books.

### A4. Create the network

**Networking → Virtual Cloud Networks → Start VCN Wizard → "Create VCN with Internet Connectivity" → Create.**

Name it `sattadhar-vcn`, accept every default CIDR, click through. This gives you a public subnet, an internet gateway, and a route table in about 60 seconds.

> **Use the wizard, not the plain `Create VCN` button.** They sit next to each other on the same page and look interchangeable, but plain *Create VCN* produces an empty network — no subnet, no internet gateway, no route — and an instance launched into it is unreachable. Depending on console version the wizard is either a **"Start VCN Wizard"** button beside `Create VCN`, or an entry in the **Actions** dropdown.
>
> <details>
> <summary>Already went through the plain form? Finish it by hand — four steps.</summary>
>
> On the create form, the field marked *Required* is **IPv4 CIDR Blocks** → `10.0.0.0/16`. Tick **"Use DNS hostnames in this VCN"** (it cannot be changed later), leave IPv6 and the DNS label alone, and create. Then from the VCN's detail page:
>
> 1. **Internet Gateways → Create Internet Gateway** → name `sattadhar-igw`.
> 2. **Route Tables → "Default Route Table for sattadhar-vcn" → Add Route Rules** → Target Type **Internet Gateway**, Destination CIDR `0.0.0.0/0`, Target `sattadhar-igw`. Without this rule the subnet is public in name only.
> 3. **Subnets → Create Subnet** → name `sattadhar-public`, type **Regional**, IPv4 CIDR `10.0.0.0/24`, Route Table *Default Route Table*, Subnet Access **Public Subnet**, Security List *Default*.
> 4. **Security Lists → Default Security List** → confirm the ingress rule for `0.0.0.0/0` TCP port `22` is present (it is, by default).
>
> </details>

You do **not** need to open any ports in the security list. The Cloudflare Tunnel dials out; nothing dials in except SSH, which is already allowed on port 22. (If you take the no-domain path in E2, you'll come back and open 80/443.)

### A5. Make an SSH key on Windows

In PowerShell on your laptop:

```powershell
ssh-keygen -t ed25519 -C "sattadhar-oracle" -f "$env:USERPROFILE\.ssh\sattadhar_oracle"
Get-Content "$env:USERPROFILE\.ssh\sattadhar_oracle.pub"
```

Press Enter twice to skip the passphrase, or set one — your call. Copy the printed `ssh-ed25519 AAAA...` line; you'll paste it in the next step. **Back up the private key** (`sattadhar_oracle`, no extension) somewhere off this laptop. Lose it and you lose SSH access to the server permanently — Oracle cannot reset it for you.

### A6. Launch the instance

**Compute → Instances → Create Instance.**

| Field | Value |
|---|---|
| Name | `sattadhar-api` |
| Image | **Canonical Ubuntu 22.04** (click *Change image*) |
| Shape | *Change shape* → **Ampere** → `VM.Standard.A1.Flex` → **2 OCPUs, 12 GB** |
| Networking | the `sattadhar-vcn` public subnet; **Assign a public IPv4 address: Yes** |
| SSH keys | *Paste public keys* → paste the line from A5 |
| Boot volume | *Specify a custom boot volume size* → **100 GB** |

Check for the **"Always Free-eligible"** badge before you click Create.

> **"Out of host capacity" / "Out of capacity for shape VM.Standard.A1.Flex".**
> This is the single most common blocker and it is not your fault — free ARM capacity in Indian regions is heavily contested. In order:
> 1. Retry, and change the **Availability Domain** dropdown (AD-1 / AD-2 / AD-3) if your region has more than one. Note that `ap-mumbai-1` and `ap-hyderabad-1` each have only a **single AD**, so in those regions this lever doesn't exist — plain retrying is all you have.
> 2. Ask for less: **1 OCPU / 6 GB** succeeds far more often than 4/24. This app runs fine on 1 OCPU.
> 3. Retry at off-peak hours (02:00–06:00 IST). Capacity is released continuously.
> 4. **Upgrade to Pay As You Go** (Billing → Upgrade). Counter-intuitive but effective: PAYG accounts are served A1 capacity ahead of trial accounts, **and your Always Free resources stay free** — you are only billed if you exceed the free allowances, which this setup never does. With the budget alert from A3 in place this is low-risk.
> 5. Last resort: shape `VM.Standard.E2.1.Micro` (AMD, 1 OCPU / **1 GB**), always available. It works, but 1 GB is tight — the bootstrap script's swap file becomes mandatory, and `npm run build` will be slow. Prefer options 1–4.

Why 100 GB boot: the database, product images, generated PDFs and 14 days of backups all live on it, and it's within the free 200 GB.

### A7. First login

Copy the **Public IP address** from the instance page.

```powershell
ssh -i "$env:USERPROFILE\.ssh\sattadhar_oracle" ubuntu@<PUBLIC_IP>
```

The user is `ubuntu` (not `root`, not `opc` — that's Oracle Linux). You're in.

---

## Part B — Prepare the server

### B1. Get the code onto the server

The repo is private, so give the server a read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "sattadhar-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Paste that into **GitHub → your repo → Settings → Deploy keys → Add deploy key** (leave "Allow write access" **unchecked**). Then:

```bash
sudo mkdir -p /opt/sattadhar
sudo chown -R ubuntu:ubuntu /opt/sattadhar
git clone git@github.com:lakhan20/SattadharTextile.git /opt/sattadhar/app
```

### B2. Run the bootstrap

```bash
bash /opt/sattadhar/app/deploy/bootstrap.sh
```

Roughly 5–10 minutes. It installs Node 20, PostgreSQL 16 (from the PGDG repo — Ubuntu 22.04's own package is Postgres 14), Nginx, PM2 and cloudflared; creates a 2 GB swap file; sets the timezone to Asia/Kolkata; creates the `sattadhar` role and database; and creates `/opt/sattadhar/{uploads,logs,backups}`.

**It prints a `DATABASE_URL` with a generated password exactly once.** Copy it now.

Uploads, logs and backups deliberately sit *outside* `/opt/sattadhar/app` so that a `git pull` or a fresh clone can never delete a product photo.

---

## Part C — Production environment file

```bash
cd /opt/sattadhar/app/backend
cp .env.example .env
openssl rand -base64 48   # run twice — you need two different secrets
nano .env
```

The values that must change from the example:

```ini
NODE_ENV=production
PORT=4000
API_PREFIX=/api/v1

# The public HTTPS address from Part E. Baked into invoice PDF links.
PUBLIC_BASE_URL=https://api.your-domain.com
CORS_ORIGINS=https://api.your-domain.com

# From the bootstrap output
DATABASE_URL=postgresql://sattadhar:<generated>@localhost:5432/sattadhar?schema=public

# Two DIFFERENT `openssl rand -base64 48` outputs. 32-char minimum is enforced
# at boot; the app refuses to start otherwise.
JWT_ACCESS_SECRET=<first>
JWT_REFRESH_SECRET=<second>

# Absolute path, outside the git checkout — must match the Nginx alias.
UPLOAD_DIR=/opt/sattadhar/uploads

SHOP_NAME=Sattadhar Textile
SHOP_STATE=Gujarat
SHOP_GSTIN=<your real 15-char GSTIN>
SHOP_PHONE=+91XXXXXXXXXX
DEFAULT_LANGUAGE=EN
TZ=Asia/Kolkata

# Used ONCE, on the first seed. Change both to something real before you run it.
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<a strong password you will actually use>
SEED_STAFF_PASSWORD=<a different strong password>

BACKUP_DIR=/opt/sattadhar/backups
BACKUP_GPG_PASSPHRASE=<a long passphrase — store it in your password manager>
BACKUP_RETENTION_DAYS=14
```

```bash
chmod 600 .env
```

`src/config/env.ts` validates all of this at boot and exits with a readable list if anything is missing or too short — so a typo here fails immediately and loudly, not three screens into the app.

Leave `PUBLIC_BASE_URL`/`CORS_ORIGINS` as placeholders for now if you haven't done Part E yet; come back and fix them, then `pm2 restart sattadhar-api`.

---

## Part D — Deploy the API

```bash
bash /opt/sattadhar/app/deploy/release.sh --first-run
```

This installs dependencies, generates the Prisma client, applies all 7 migrations, compiles TypeScript, seeds the admin + 3 sample staff accounts, starts the app under PM2, and registers PM2 with systemd so it survives a reboot.

> **Why build on the server rather than uploading `dist/` from Windows?** Prisma ships a platform-specific query engine binary. A `node_modules` built on Windows contains the Windows engine and will not run on `linux-arm64`. Always build where you run.

The `--first-run` flag prints a `sudo env PATH=... pm2 startup systemd` command — the script runs it for you, but if it asks you to run something manually, do it and then `pm2 save`.

Then wire up Nginx:

```bash
cd /opt/sattadhar/app
sudo cp deploy/nginx/sattadhar.conf /etc/nginx/sites-available/sattadhar
sudo ln -sf /etc/nginx/sites-available/sattadhar /etc/nginx/sites-enabled/sattadhar
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Verify — both must return JSON:

```bash
curl -s localhost:4000/health   # the app directly
curl -s localhost/health        # through Nginx
pm2 status                      # sattadhar-api │ online
```

If `pm2 status` shows `errored`, `pm2 logs sattadhar-api --lines 50` will name the bad env var.

---

## Part E — Put it on HTTPS

Android blocks plaintext HTTP by default, so this step is not optional.

### E1. With a domain — Cloudflare Tunnel *(recommended)*

Buy any domain (~₹700–1200/year: `.in` at BigRock/GoDaddy, `.com` at Namecheap/Porkbun), add it to a free Cloudflare account, and switch the nameservers at your registrar to the two Cloudflare gives you. Propagation is usually under an hour.

Why this is worth ₹900/year rather than E2:

- **No inbound ports open at all.** `cloudflared` dials *out*. Your server has no attack surface beyond SSH.
- **TLS certificates are automatic and never expire on you.**
- **The API address never changes**, even if the Oracle instance gets a new public IP. That matters enormously, because the address is compiled into the APK on every phone in the shop.

On the server:

```bash
cloudflared tunnel login          # prints a URL — open it on your laptop, pick the domain
cloudflared tunnel create sattadhar
cloudflared tunnel route dns sattadhar api.your-domain.com
```

`create` prints a **tunnel UUID** and writes `~/.cloudflared/<UUID>.json`. Install the config:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /opt/sattadhar/app/deploy/cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
sudo nano /etc/cloudflared/config.yml     # replace both <UUID> and api.example.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared --no-pager
```

From your laptop:

```powershell
curl.exe https://api.your-domain.com/health
```

Then in Cloudflare's dashboard, **SSL/TLS → Overview → Full**, and **Security → WAF** is on by default. Nothing else to configure.

Now go back and fix `PUBLIC_BASE_URL` and `CORS_ORIGINS` in `backend/.env`, then `pm2 restart sattadhar-api`.

### E2. Without a domain — nip.io + Let's Encrypt

Free, but the hostname contains your IP, so **if the IP ever changes every installed APK breaks.** If you go this way, first reserve the IP: **Instance → Attached VNICs → the VNIC → IPv4 Addresses → Edit the public IP → change Ephemeral to Reserved.**

Open the ports in **both** firewalls — Oracle has two, and forgetting the second one is the classic "my server is up but nothing connects" bug:

1. **VCN security list:** Networking → VCN → the public subnet → its Security List → **Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination ports `80` and `443`.
2. **The instance's own iptables** — Oracle's Ubuntu images ship with a `REJECT` rule that blocks everything but SSH. You must *insert* before it, not append after it:

```bash
IP=$(curl -s ifconfig.me)
LINE=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"||$2=="DROP"{print $1; exit}')
sudo iptables -I INPUT "$LINE" -p tcp --dport 80  -m state --state NEW -j ACCEPT
sudo iptables -I INPUT "$LINE" -p tcp --dport 443 -m state --state NEW -j ACCEPT
sudo netfilter-persistent save
```

Then edit `/etc/nginx/sites-available/sattadhar`, set `server_name <IP>.nip.io;`, and:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d "$IP.nip.io"
```

Your API is `https://<IP>.nip.io`. Certbot auto-renews via a systemd timer.

---

## Part F — Backups and hardening

### Nightly backups

```bash
crontab -e
```

```cron
15 2 * * * /opt/sattadhar/app/deploy/backup.sh >> /opt/sattadhar/logs/backup.log 2>&1
```

`backup.sh` dumps Postgres (`pg_dump -Fc`), tars `/opt/sattadhar/uploads`, encrypts both with your `BACKUP_GPG_PASSPHRASE`, optionally pushes off-site via rclone, and prunes past `BACKUP_RETENTION_DAYS`.

**A backup on the same boot volume as the database is not a backup.** Set up an off-site target — `rclone config` against Google Drive takes ten minutes and is free:

```bash
sudo apt-get install -y rclone
rclone config      # name the remote "offsite", type: drive
# then in backend/.env:  RCLONE_REMOTE=offsite:sattadhar-backups
```

Run it once by hand and then **actually test a restore** into a throwaway database. The restore commands are in the comment block at the bottom of `deploy/backup.sh`.

### Log rotation

Pino logs every request; without rotation these fill the boot volume in a few months.

```bash
sudo npm install -g pm2-logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

### Unattended security updates

```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # choose Yes
```

### Change the seeded passwords

The seed created `admin` plus three sample STAFF accounts with the passwords from `.env`. Log in as admin from the app and change them — or at minimum confirm nobody outside the shop ever saw that `.env`. `npx tsx scripts/list-users.ts` from `backend/` shows who exists.

---

## Part G — Build the APK

Done on your **Windows laptop**, not the server.

### G1. Point the build at your API

Edit [mobile/eas.json](../mobile/eas.json) and replace the placeholder in the `production` profile:

```json
"env": { "EXPO_PUBLIC_API_URL": "https://api.your-domain.com" }
```

It has to live in `eas.json` rather than a `.env` file, because `.env` is gitignored and EAS Build respects `.gitignore` when it uploads the project — the variable would silently vanish. It's a public URL, not a secret, so this is fine.

Safety net: whatever a user saves under **More → Server settings** in the app always wins over the compiled-in value. A wrong URL here is recoverable without a rebuild.

### G2. Build

```powershell
cd d:\lakhan\SattadharTextile\mobile
npm install -g eas-cli
eas login                 # free Expo account, create one if needed
eas init                  # writes extra.eas.projectId into app.json — commit this
eas build --platform android --profile production
```

First run asks **"Generate a new Android Keystore?"** → **Yes**. Expo generates and stores it.

> **Back that keystore up immediately:**
> ```powershell
> eas credentials    # Android → production → Keystore → Download
> ```
> Store the `.jks` and its passwords in your password manager. Android identifies an app by its signature: if you lose this keystore, a future APK cannot be installed as an *update* over the current one — every phone must uninstall first, and uninstalling wipes the saved login and server settings. There is no recovery path.

The free tier queues builds, so expect 10–30 minutes. It ends with a download URL for the APK, also visible at `expo.dev`.

`buildType: "apk"` is deliberate — the default for `production` is AAB, which is a Play Store upload format and **cannot be sideloaded**.

### G3. Distribute

Share the APK link over WhatsApp, or download it and share the file. On each phone:

1. Tap the APK → Android asks to allow **"Install unknown apps"** for WhatsApp/Chrome → allow it.
2. Play Protect will warn about an unrecognised developer → **Install anyway**. Expected for any sideloaded app.
3. Open the app, log in with the admin or staff credentials.
4. If it can't reach the server: **More → Server settings**, type the URL, **Test connection**, save.

### G4. Shipping an update later

Bump both fields in [mobile/app.json](../mobile/app.json) — Android refuses to install over an existing app unless `versionCode` increases:

```json
"version": "1.0.1",
"android": { "versionCode": 2 }
```

Then rebuild and reshare. Same keystore ⇒ it installs cleanly over the old one and keeps all local data.

*(Optional, later: `expo-updates` + `eas update` would let you push JS-only changes over the air without redistributing an APK. Not set up here.)*

---

## Part H — Running it day to day

### Deploying a backend change

```bash
ssh ubuntu@<server>
bash /opt/sattadhar/app/deploy/release.sh
```

Pull, install, migrate, build, zero-downtime reload, health check.

### Everyday commands

| | |
|---|---|
| `pm2 status` | is it up |
| `pm2 logs sattadhar-api` | live logs |
| `pm2 logs sattadhar-api --err --lines 100` | recent errors only |
| `pm2 restart sattadhar-api` | after an `.env` change |
| `pm2 monit` | CPU / memory |
| `sudo systemctl status cloudflared` | tunnel health |
| `df -h /` · `free -h` | disk and memory |
| `sudo -u postgres psql sattadhar` | database shell |
| `bash deploy/backup.sh` | backup right now |

### Health monitoring

`GET https://api.your-domain.com/health` is public, cheap, and not rate-logged. Point a free UptimeRobot monitor at it with a 5-minute interval and email alerts — you'll hear about an outage from a robot instead of from the counter staff.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Out of host capacity` creating the instance | Free ARM contention | A6 — try other ADs, ask for 1 OCPU, retry off-peak, or upgrade to PAYG |
| Server is up, nothing connects on 80/443 | Only the VCN firewall was opened, not iptables | E2 step 2 — **insert** the rule before the `REJECT` line |
| `pm2 status` → `errored` right after start | Missing/short env var | `pm2 logs sattadhar-api` — the boot validator names it. Secrets need 32+ chars |
| `Can't reach database server at localhost:5432` | Postgres down, or wrong password | `sudo systemctl status postgresql`; re-check `DATABASE_URL` |
| `PrismaClientInitializationError: query engine not found` | `node_modules` copied from Windows | Never upload `node_modules`/`dist`. `rm -rf node_modules && bash deploy/release.sh` |
| App says "Network error", browser reaches the API fine | App is pinned to an old address | **More → Server settings → Test connection** |
| 413 on product image upload | Nginx body limit below multer's | `client_max_body_size` must exceed `MAX_UPLOAD_MB` |
| Invoice PDF links point at `localhost` | `PUBLIC_BASE_URL` still the default | Fix it in `.env`, `pm2 restart sattadhar-api` |
| Product images 404 after a redeploy | `UPLOAD_DIR` inside the git checkout | Must be `/opt/sattadhar/uploads`, matching the Nginx `alias` |
| APK won't install over the old one | `versionCode` not bumped, or a different keystore | G4; if the keystore changed, uninstall first (this wipes local app data) |
| Cloudflare 502 | Node or Nginx down | `pm2 status`, `sudo systemctl status nginx` |
| Build fails / OOM on E2.1.Micro | 1 GB RAM | Confirm swap is on: `swapon --show` |

---

## Pre-launch checklist

- [ ] Budget alert configured (A3) and MFA enabled
- [ ] `https://api.your-domain.com/health` returns JSON from outside the server
- [ ] `PUBLIC_BASE_URL` and `CORS_ORIGINS` are the real HTTPS origin
- [ ] Both JWT secrets are 48-byte random values, and different from each other
- [ ] `chmod 600 backend/.env`; `.env` is not in git
- [ ] Seeded admin/staff passwords changed from the `.env` defaults
- [ ] `pm2 save` done and the app survives `sudo reboot`
- [ ] Backup cron installed, **and a restore tested on a throwaway database**
- [ ] `RCLONE_REMOTE` set — backups exist somewhere other than this server
- [ ] EAS keystore downloaded and stored in a password manager
- [ ] APK installs and logs in on a real phone, on mobile data (not just shop Wi-Fi)
- [ ] Real `SHOP_GSTIN` and `SHOP_PHONE` — they print on every invoice
- [ ] SSH private key backed up off the laptop
