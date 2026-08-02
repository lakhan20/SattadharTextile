Written for someone who has never run a React Native app before. Follow it in order — each step depends on the one above it.

There is no APK to install yet. During development the app runs inside a free app called **Expo Go**: your laptop serves the code, and Expo Go on the phone downloads and runs it. Change a file on the laptop and the phone updates in about a second.

---

## The picture

Three things must be able to talk to each other:

```
   PHONE                          LAPTOP
   ┌──────────┐                   ┌────────────────────────┐
   │ Expo Go  │ ──── port 8081 ──▶│ Expo dev server        │  the app's code
   │          │                   │ (npx expo start)       │
   │ Sattadhar│ ──── port 4000 ──▶│ Express API            │  the shop's data
   │  app     │                   │ (npm run dev)          │
   └──────────┘                   └────────────────────────┘
        └────── same Wi-Fi network ──────┘
```

**Both ports matter.** 8081 delivers the app, 4000 delivers the data. If only 8081 gets through, the app opens but sign-in fails.

---

## Step 0 — Update Node.js *(required)*

Expo SDK 57 needs Node **20.19.4 or newer**. Check yours:

```powershell
node --version
```

If it prints anything below `v20.19.4`, download the current **LTS** installer from <https://nodejs.org> and run it. Accept the defaults; it replaces the old version in place.

Then **close every terminal window and open a new one** — an open terminal keeps using the old Node — and confirm:

```powershell
node --version
```

Reinstalling Node does not affect the project. You do not need to run `npm install` again.

---

## Step 1 — Install Expo Go on the phone

Open the **Play Store**, search **Expo Go**, install it. Free, published by Expo. You do **not** need to create an account.

---

## Step 2 — Put the phone on the same Wi-Fi as the laptop

Not mobile data. Not a guest network. The exact same Wi-Fi.

Your laptop is currently on **`Sattadhar_5G 2`** at address **`192.168.29.26`**. Connect the phone to that same network.

> Your laptop also has a second address, `192.168.137.1` — that is the Windows Mobile Hotspot adapter. Ignore it unless the phone is connected to the laptop's own hotspot, in which case *that* is the address to use.

To re-check the laptop's address at any time:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" } | Select-Object IPAddress, InterfaceAlias
```

---

## Step 3 — Open the firewall *(this is the step that catches everyone)*

Windows blocks incoming connections by default, and your Wi-Fi is classed as a **Public** network, which is the strictest setting. Right now your phone cannot reach the laptop at all.

Open **PowerShell as Administrator** — press `Win`, type *PowerShell*, right-click **Windows PowerShell**, choose **Run as administrator**, click **Yes**.

Paste both lines:

```powershell
New-NetFirewallRule -DisplayName "Sattadhar Expo" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Profile Any -RemoteAddress LocalSubnet
New-NetFirewallRule -DisplayName "Sattadhar API"  -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Any -RemoteAddress LocalSubnet
```

`-RemoteAddress LocalSubnet` limits this to devices on your own Wi-Fi — nothing from the wider internet can reach these ports.

You only ever do this once. To undo it later:

```powershell
Remove-NetFirewallRule -DisplayName "Sattadhar Expo","Sattadhar API"
```

---

## Step 4 — Start the backend

In a terminal:

```powershell
cd d:\lakhan\SattadharTextile\backend
npm run dev
```

Leave it running. You should see a line ending in `API listening on http://localhost:4000/api/v1`.

Check it from the laptop's browser: <http://localhost:4000/health> should show
`{"data":{"status":"ok","database":"up", ...}}`.

---

## Step 5 — Start the app server

In a **second** terminal — the first one stays busy:

```powershell
cd d:\lakhan\SattadharTextile\mobile
npx expo start
```

After a few seconds you get a **QR code** and a line like:

```
› Metro waiting on exp://192.168.29.26:8081
```

**Check that address.** It must be the laptop's Wi-Fi address (`192.168.29.26`). If it shows `127.0.0.1` or the hotspot address instead, press `Ctrl+C` and restart with:

```powershell
npx expo start --host lan
```

If it says *Port 8081 is being used*, an older Expo server is still running. Either answer `y` to use another port, or close the other terminal first.

---

## Step 6 — Scan the QR code

On Android, **open Expo Go first**, then tap **Scan QR code** inside it. (The phone's built-in camera app usually will not launch it.)

The first load takes 30–60 seconds — the phone is downloading about 5 MB of app code. You will see a progress bar, then the indigo **SATTADHAR TEXTILE** login screen.

---

## Step 7 — Sign in

| Username | Password |
|---|---|
| `admin` | the value of `SEED_ADMIN_PASSWORD` in `backend/.env` |
| `kirti`, `jignesh`, `meera` | the value of `SEED_STAFF_PASSWORD` (default `Staff@123`) |

Sign in as **admin** and then as **kirti** — the dashboards are deliberately different. Staff never see revenue, profit or shop-wide totals, and the server refuses those requests regardless of what the app shows.

To see the account list at any time:

```powershell
cd d:\lakhan\SattadharTextile\backend
npx tsx scripts/list-users.ts
```

Five wrong passwords locks an account for 15 minutes. That is the lockout working, not a bug.

---

## If something does not work

Everything below assumes both terminals are still running.

### "Project is incompatible with this version of Expo Go"

Your phone reached the laptop — this is progress. Expo Go supports **exactly one SDK version at a time**, and the copy on your phone is older than the SDK this project uses.

| | |
|---|---|
| Project SDK | **57** (`expo ~57.0.9`, React Native 0.86.2) |
| Expo Go needed | **57.0.2** or newer on Android |

**First try the Play Store.** Open Expo Go's store page and press **Update**. Then open Expo Go → the profile/settings tab → check the version reads `57.x`. Force-close and reopen it, then scan again.

**If the Play Store offers no update,** SDK 57 is recent and the rollout may not have reached your device. Install the official build directly — on the **phone's** browser, open:

```
https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.2/Expo-Go-57.0.2.apk
```

That is Expo's own GitHub release (208 MB). Android will warn about installing outside the Play Store; allow the browser to install unknown apps for this one file. It replaces the old Expo Go in place — no need to uninstall first.

To confirm which client version any SDK needs:

```powershell
curl.exe -s https://api.expo.dev/v2/versions/latest
```

Look for `androidClientVersion` under `sdkVersions → 57.0.0`.

### The QR scan hangs, or "Something went wrong" in Expo Go

The phone cannot reach port 8081. In the phone's browser, open:

```
http://192.168.29.26:8081/status
```

- Shows `packager-status:running` → the network is fine; force-close Expo Go and scan again.
- Times out → Step 3 (firewall) did not take effect, or the phone is on a different network.

### The app opens but sign-in says "Cannot reach the server"

The app got through on 8081 but not 4000. In the phone's browser, open:

```
http://192.168.29.26:4000/health
```

- Shows JSON → the API is reachable; check the address inside the app (below).
- Times out → the port-4000 firewall rule is missing. Re-run that line from Step 3.

### Check the address the app is using

In the app: **More → Server settings**. It should read `192.168.29.26:4000`. If not, type the correct address, press **Test connection**, and save once it reports *Reachable*. Whatever you save there wins over everything else and survives a restart.

### "This account is no longer active"

That account was deactivated. Sign in as `admin` instead.

### Account locked

Wait 15 minutes, or reset the password as admin — see step 11 in [backend/requests.http](../backend/requests.http).

### Some other network entirely

If the Wi-Fi blocks devices from seeing each other (common on public and office networks), use the laptop's **Mobile Hotspot** instead: turn it on in Windows Settings, connect the phone to it, and the laptop's address becomes `192.168.137.1`. Set that in **More → Server settings**.

`npx expo start --tunnel` will load the *app* over the internet without any firewall changes, but the API stays on your laptop and the phone still cannot reach it — so sign-in will not work. That gap closes at the deployment stage, when the API goes behind a Cloudflare Tunnel with a real HTTPS address.

---

## Day-to-day, once it works

1. Terminal 1: `cd backend` → `npm run dev`
2. Terminal 2: `cd mobile` → `npx expo start`
3. Open Expo Go → it remembers the last project → tap it

Editing a file on the laptop refreshes the phone in about a second. Shake the phone to open the developer menu (**Reload** is there if it ever gets stuck).

You stay signed in between restarts — the tokens are kept in the phone's secure keystore, and the app re-checks them with the server each launch.

---

## Later: a real APK

When you want the app on staff phones without a laptop, we build a signed standalone APK with EAS and sideload it. No Play Store, no Expo Go, no dev server — it talks straight to the deployed API. That comes with the deployment stage.
