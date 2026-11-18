# Smart Baby Monitor — Watch It From Anywhere (Vercel Setup Guide)

This guide is for someone who is comfortable with wires and soldering but **not** with software.
Do the parts **in order (A → F)**. You never need to write code. You only copy, paste and click.
Total time: about 45–60 minutes the first time.

---

## How it works (in plain words)

The board in the baby's room can't be reached from outside directly. Indian mobile and home
internet (Jio, Airtel, etc.) share one public address between many customers. So both the board
and the parent's phone **call out** to your own free website on **Vercel**, which works on any network.

```
 [Baby room]                         [Internet]                          [Parent, anywhere]
 ESP8266 + sensors ──► Wi-Fi ──► Your Vercel website (free) ◄── Phone (mobile data / any Wi-Fi)
   - sends readings                  - remembers the latest             - opens your website link
   - picks up Mute / Test              readings in a small free         - sees alerts, taps buttons
     commands                          database (Redis)
```

- While the parent has the dashboard **open on screen**, the board checks in every **4 seconds**.
  When nobody is watching, it checks in every **20 seconds** to stay inside the free plan.
- Alerts (crying, wet, gas) are sent **straight away**, without waiting for the next check-in.
- A button tap on the phone reaches the room within about **4–6 seconds**.
- The **old same-Wi-Fi page still works** (`http://<board IP>`), and the **room buzzer works even with no internet**.
- **Wiring does not change.** D1 = Buzzer, D2 = Mic, D5 = MQ-7 gas, A0 = Rain/wetness sensor.

### Files in this folder

| File / folder | What it is | Where it goes |
|---|---|---|
| `vercel-app/` | Your website: the parent's dashboard + the "post office" code | Uploaded to GitHub, then Vercel (Parts A–C) |
| `BabyMonitor_Vercel/BabyMonitor_Vercel.ino` | The program for the ESP8266 board | Uploaded to the board with Arduino IDE (Part E) |
| `README.md` | This guide | — |

> 🔒 **Never upload the `.ino` file to GitHub.** It contains your Wi-Fi password and secret key.
> Only the **contents of `vercel-app`** go to GitHub.

### Your secret key

This key is already typed into the `.ino` file for you:

```
bm-ycCJ295WRgM757
```

You will paste it into Vercel (Part B) and type it once on the phone (Part F).
It stops strangers from seeing the readings or sounding the buzzer. Keep it private.

---

## What you need

- Your ESP8266 board (NodeMCU or Wemos D1 mini) with the sensors already soldered
- A USB **data** cable (some cheap cables only charge — if the PC doesn't see the board, try another cable)
- A Windows/Mac/Linux computer with **Chrome** or **Edge**
- The board's Wi-Fi must be **2.4 GHz** (ESP8266 cannot see 5 GHz).
  On a phone hotspot: *Settings → Hotspot → AP band → 2.4 GHz*.
- An email address (for free GitHub and Vercel accounts)

---

## Part A — Put the website files on GitHub — 10 min

1. Go to **https://github.com** and **Sign up** (free). Verify your email.
2. Click the **+** at the top right → **New repository**.
   - Repository name: `baby-monitor`
   - Choose **Private** (recommended)
   - Click **Create repository**.
3. On the next page click the link **"uploading an existing file"**.
4. On your computer, **open the `vercel-app` folder**. Select **everything inside it**
   (`api`, `public`, `package.json`, `package-lock.json`, `vercel.json`) and **drag them all** into the browser window.
   - ⚠️ Drag the things **inside** `vercel-app`, not the `vercel-app` folder itself.
5. Wait until all files are listed, then click **Commit changes** (green button).
6. Check: the repository's main page should show `api`, `public`, `package.json`, `package-lock.json`
   and `vercel.json` at the top level. If you see a single `vercel-app` folder instead, delete the
   repository (*Settings → bottom of page → Delete this repository*) and repeat steps 2–5.

---

## Part B — Create the Vercel website — 10 min

1. Go to **https://vercel.com/signup**. Choose **Hobby** (free), type your name, and click
   **Continue with GitHub**. Allow access when GitHub asks.
2. On the Vercel dashboard click **Add New…** → **Project**.
3. Find `baby-monitor` in the list and click **Import**.
   - If it is not listed: click **Adjust GitHub App Permissions** (or *Install*), give Vercel
     access to `baby-monitor`, then come back.
4. **Framework Preset**: choose **Other**. Leave *Root Directory* as `./` and don't touch the build settings.
5. Open the section **Environment Variables**.
6. Add one variable:
   - **Key**: `MONITOR_KEY`
   - **Value**: `bm-ycCJ295WRgM757`
   - Click **Add**.
7. Click **Deploy**. Wait about 1 minute for the confetti 🎉, then click **Continue to Dashboard**.

The website exists now, but it can't remember anything yet. That's the next part.

---

## Part C — Add the free database — 5 min

Vercel's code forgets everything between visits. A small free **Redis** database remembers the
latest readings and any waiting commands.

1. In your project, click the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**), then choose **Redis** (*"Official Redis for Vercel"*, by Redis).
   Click **Continue**.
3. Choose the **Free** plan.
   - Region: pick **US East (N. Virginia)** or anything that says *us-east*. That is where Vercel
     runs your code by default, so the two sit close together.
4. Click **Create** / **Continue**. If asked, sign in to (or create) a free Redis Cloud account
   with the same email.
5. When asked which project to connect, pick **baby-monitor**, keep **all environments** ticked,
   and click **Connect**.
6. **Redeploy** so the website picks up the database:
   **Deployments** tab → the top deployment → the **⋯** menu → **Redeploy** → **Redeploy**. Wait ~1 minute.

> **No "Redis" option?** Choose **Upstash for Redis → Free** instead. Everything works the same, but
> Upstash's free plan allows only 500,000 database commands a month. That is enough for about
> **4 hours a day** of the dashboard being open. Redis (above) has no monthly limit, so prefer it.

---

## Part D — Check your website works — 3 min

1. In the project's **Overview** page, find **Domains**. Your link looks like:
   **`baby-monitor-abc.vercel.app`**
   👉 Copy it into a notepad. This is **your link**.
   - ⚠️ Use the **short** link under *Domains*. Don't use the long one with random letters
     (like `baby-monitor-8f3k2-yourname.vercel.app`): that one is locked and the board will get error 401.
2. In your browser open your link with this added at the end:
   **`https://baby-monitor-abc.vercel.app/api/monitor?op=health`**
3. You should see `"ok":true` and the message **"All good"**.

| You see | Fix |
|---|---|
| `"keySet":false` | Part B step 6 was missed. *Settings → Environment Variables*, add `MONITOR_KEY`, then **Redeploy** (Part C step 6). |
| `"database":false` | Part C not done, or no Redeploy after it. |
| A Vercel **login page** | *Settings → Deployment Protection → Vercel Authentication* → choose **Standard Protection** (not *All Deployments*) → **Save**. |
| `404: NOT_FOUND` | Files are inside a `vercel-app` folder on GitHub. Redo Part A step 6. |

---

## Part E — Put your link in the board and upload — 15 min

**One-time Arduino IDE setup:**

1. Install **Arduino IDE 2** from https://www.arduino.cc/en/software and open it.
2. **Add the ESP8266 boards:**
   - **File → Preferences** (Mac: *Arduino IDE → Settings*).
   - In **Additional boards manager URLs**, paste:
     `https://arduino.esp8266.com/stable/package_esp8266com_index.json` → **OK**.
   - **Tools → Board → Boards Manager**, search **esp8266**, install **"esp8266 by ESP8266 Community"**.
   - ✅ No other libraries are needed.

**Upload:**

1. Keep the file inside its folder: `BabyMonitor_Vercel/BabyMonitor_Vercel.ino`
   (Arduino IDE requires the folder and file to have the same name). Double-click the `.ino` to open it.
2. Scroll to the box near the top marked **YOUR SETTINGS**. It is the only part you change.
3. Replace `PASTE-YOUR-VERCEL-LINK-HERE` with **your link** from Part D. Keep the quotes:
   ```cpp
   const char* SERVER_URL    = "https://baby-monitor-abc.vercel.app";
   ```
   Also check the Wi-Fi name and password are right for the room's Wi-Fi.
   Leave `MONITOR_KEY` and `DEVICE_ID` as they are.
4. Plug in the board. Choose:
   - **Tools → Board → esp8266 → NodeMCU 1.0 (ESP-12E Module)**
     (Wemos board: **LOLIN(WEMOS) D1 R2 & mini**)
   - **Tools → Port →** the COM port that appeared when you plugged in the board
   - **Tools → CPU Frequency → 160 MHz** (makes the secure connection faster — recommended)
5. Click **Upload** (→ arrow). Wait for **"Done uploading"**.
6. **Tools → Serial Monitor**, set speed (bottom right) to **9600 baud**, press the board's **RST** button. You should see:
   ```
   Wi-Fi Connected!
   Same-Wi-Fi dashboard URL: http://192.168.43.120
   Cloud server: baby-monitor-abc.vercel.app   Monitor name: baby1
   Cloud CONNECTED. Remote dashboard is live.
   Mic: 0 | Gas: 1 | Rain: 1023 | IP: 192.168.43.120 | Cloud: online (idle)
   ```
   ✅ **`Cloud: online`** means the board side is finished.

---

## Part F — Use it on the parent's phone — 2 min

1. Open **your link** (`https://baby-monitor-abc.vercel.app`) in **Chrome** on the phone.
2. Type the **Monitor key** `bm-ycCJ295WRgM757` and **Monitor name** `baby1` → **Connect**.
   (The phone remembers them.)
3. You should see **Live** at the top and four cards: Crying, Diaper, Air, Room buzzer.
4. **Tap anywhere once** so the phone is allowed to beep (browsers block sound until you tap).
5. Make it feel like an app: Chrome **⋮ menu → Add to Home screen**.

### Test that it really works from outside

1. On the parent's phone, **turn OFF Wi-Fi** and use **mobile data**.
2. Clap near the mic → within a few seconds the phone shows **Crying**, a red banner, and beeps/vibrates.
3. Tap the round **Test buzzer** button → the room buzzer sounds within about 5 seconds. Tap again to stop.
4. Turn on **Sleep mode** → the room buzzer stays quiet during alerts (the phone still alerts).
5. Unplug the board → within about a minute the phone shows **Monitor is OFFLINE**.

---

## Free plan limits (why the board slows down when nobody watches)

The free Vercel plan allows **1,000,000 requests a month**. Every board check-in and every phone
check is one request.

| Dashboard open on screen | Requests per month | Inside the free plan? |
|---|---|---|
| 4 hours a day | about 320,000 | ✅ |
| 8 hours a day | about 520,000 | ✅ |
| 12 hours a day | about 710,000 | ✅ |
| 16 hours a day | about 910,000 | ✅ (just) |
| 20+ hours a day | over 1,000,000 | ❌ |

- If the phone is locked or the browser is in the background, the page checks only every 30 s and
  the board goes back to its slow 20 s pace. That costs very little.
- See usage any time: Vercel project → **Usage**.
- If the limit is reached, Vercel pauses the website until the month resets. The **room buzzer
  keeps working**, but the remote view stops.
- The Vercel free (Hobby) plan is for **personal, non-commercial use only**.

---

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| Serial Monitor shows only dots `.....` | Board can't join Wi-Fi | Check Wi-Fi name/password (capital letters matter). Hotspot must be **2.4 GHz**. |
| `Cloud NOT set up yet` | `SERVER_URL` still says PASTE-... | Part E step 3, upload again. |
| `code=401` | Key mismatch, or the website is locked | Key in `.ino` must equal `MONITOR_KEY` in Vercel exactly. Use the **short** link (Part D step 1). Check *Deployment Protection* (Part D table). |
| `code=404` | Wrong link, or files in the wrong place | Copy the link again from *Domains*. Do the Part D health check. |
| `code=500` / `503` and *server says …* | Website problem | Read the message. Usually Part C (database) or Part B step 6 (key), then **Redeploy**. |
| `code=-1` (connection failed) | Board can't reach the internet | Check the hotspot has mobile data. Set **CPU Frequency 160 MHz**. If *free memory* is below ~15000, press RST. |
| Phone: "Wrong monitor key" | Typo on the phone | Re-type `bm-ycCJ295WRgM757` (copy-paste is best). |
| Phone: "Waiting for monitor" / OFFLINE | Phone is fine, board is not reporting | Check board power and `Cloud: online` in Serial Monitor. **Monitor name** must match `DEVICE_ID` exactly. |
| Phone: "Server problem: Database not connected…" | Database not linked | Part C, then Redeploy. |
| No beep on phone | Sound not unlocked / phone on silent | Tap the screen once. Turn up media volume. |
| Same-Wi-Fi page `http://<IP>` doesn't open | Phone is on a different network | Normal — use your Vercel link when away. |
| Upload fails / no COM port | Charge-only cable or missing driver | Try another USB cable; install the **CH340** or **CP2102** driver for your board. |
| Redis database disappeared | Free Redis databases are deleted after 14 days with **no use at all** | Only happens if the board was off for 2+ weeks. Redo Part C. |

### Changing the secret key later

Change it in **all three** places, then **Redeploy**:
Vercel *Settings → Environment Variables → MONITOR_KEY*, the `.ino` (`MONITOR_KEY`, upload again),
and the phone (*Change connection settings*).

---

## Important safety notes — please read

- **This is a helper, not a medical device.** Never rely on it as the only way to watch a baby.
- The phone alerts **only while the dashboard page is open and on screen**. Keep the screen on and the
  phone charging (the page tries to keep the screen awake). If the phone locks, it **cannot** beep.
- Remote alerts take a few seconds to arrive. The **room buzzer** reacts instantly.
- Free services have **no uptime guarantee**. If Vercel, the database or the internet is down, the
  remote view stops, but the **room buzzer keeps working**.
- The connection is encrypted (HTTPS). To keep things simple and reliable, the board does not check
  Vercel's security certificate.

---

## Technical summary (for the programmer)

- **Server**: one Vercel Function, `vercel-app/api/monitor.js` (Node.js, Web `fetch` handler, Fluid
  compute). Static dashboard in `vercel-app/public/index.html`. State lives in Redis via `REDIS_URL`
  (`KV_URL` also accepted), using `node-redis`.
- **Auth**: header `x-monitor-key` compared in constant time with env `MONITOR_KEY`.
- **Endpoints** (`id` = `DEVICE_ID`, `[A-Za-z0-9-]{1,32}`):
  - `GET  /api/monitor?op=health`: setup check, no key, no secrets
  - `POST /api/monitor?op=device&id=<id>`: board sends status JSON, reply `{"watching":bool,"cmds":[...]}`
  - `GET  /api/monitor?op=status&id=<id>[&watch=1]`: phone reads `{status, now}`. `watch=1` (page visible) sets a 20 s "viewer" flag
  - `POST /api/monitor?op=cmd&id=<id>`: body = `buzzer_on|buzzer_off|mute_on|mute_off|toggle_buzzer|toggle_mute`
- **Redis keys**: `bm:<id>:status` (JSON + server `ts`, TTL 1 day), `bm:<id>:cmd` (list, TTL 60 s,
  so stale commands never fire late), `bm:<id>:viewer` (PX 20 s).
- **Board**: HTTPS POST with `ESP8266HTTPClient`, keep-alive (`setReuse`) and BearSSL session reuse.
  Interval 4 s when `watching`, else 20 s. Important state changes are sent early (minimum gap 1.5 s).
  Errors back off from 5 s to 60 s. The status JSON adds `next` (seconds until the next check-in).
  The phone treats the monitor as offline when the reading is older than `2 × next + 8 s`.
- **Failure behaviour**: a database outage returns an error in under a second (2 quick retries, then
  an 8–9 s cap on every request), so functions never hang until Vercel's 300 s limit.
- A secure handshake can pause the board's loop for about 1–2 s. The buzzer keeps its state during that
  time, and the 2 s mic hold covers the gap.
