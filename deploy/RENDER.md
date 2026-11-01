# Free hosting on Render.com — full step-by-step
# (facts verified against https://render.com/docs/free on 2026-10-31)

Free tier reality (official):
- Web Service on the **Free** compute plan: 512 MB RAM, 0.1 CPU
- **Spins down after 15 minutes with no traffic**; wakes in ~1 minute on
  the next request (renders a loading page meanwhile)
- **750 free instance hours/month** per workspace (one always-on service
  uses ~730 h — exactly fits; keep-alive pings keep it awake without charges)
- **Docker runtime is supported on Free** (builds consume your included
  build-pipeline minutes)
- Ephemeral filesystem (fine — our binaries re-download on boot)
- **Custom domains + automatic TLS are FREE**
- No credit card required for the free tier
- Outbound bandwidth counts against your included monthly amount (downloads
  stream through the server — heavy traffic may consume it)

---

## Part 0 — Put the repo on GitHub (one time)

1. Create a (private is fine) repository at https://github.com/new
   - name: `download-anything`, do NOT initialize with README
2. On your PC:

```powershell
cd "E:\Z CODE\download-anything"
git remote add github https://github.com/<YOUR-USERNAME>/download-anything.git
git push -u github master
```

Everything Render needs is already committed at the repo root:
`Dockerfile`, `render.yaml`, `.dockerignore`, full `apps/` source.

## Part 1 — Create the service (dashboard clicks)

1. Sign up: https://dashboard.render.com/register → **GitHub** (fastest).
2. In the Dashboard click **New +** → **Web Service**.
3. If asked, click **Connect** next to your `download-anything` repo.
4. Configure — most fields auto-fill from `render.yaml`:
   - **Name**: `download-anything` → your URL becomes
     `https://download-anything.onrender.com`
   - **Language/Runtime**: `Docker` · **Dockerfile path**: `./Dockerfile`
   - **Instance Type**: **Free** (512 MB) ← choose this explicitly if not pre-selected
   - **Health Check Path**: `/api/health`
5. Click **Create Web Service** and watch **Events/Logs**:
   - "Building…" (~3–5 min: npm ci + vite build)
   - "Starting…" (~30 s: the container downloads Linux yt-dlp + ffmpeg)
   - "Your service is live" — done. Open the URL and paste a YouTube link.

## Part 2 — Never sleep (free keep-alive)

1. Create a free account at https://cron-job.org → Cronjobs → **CREATE CRONJOB**
2. Title `keep-da-awake` · URL: `https://<your-app>.onrender.com/api/health`
3. Schedule: **every 10 minutes** → Save.
4. (Optional toggle) Disable the cronjob if you *want* it to sleep.

With pings every 10 min the service never spins down, binaries stay cached,
and every visitor gets instant loads.

## Part 3 — Domain `downloadanything.online` (free TLS)

1. In your Cloudflare dashboard (DNS for the domain):
   - Add a `CNAME` record: name `@` (or `www`) →
     `download-anything.onrender.com` — **set Proxy status to "DNS only"
     (grey cloud)** for now (Render issues its own TLS cert).
2. In Render: your service → **Settings → Custom Domains → Add Custom Domain**
   → enter `downloadanything.online` → verify. Render issues a free TLS
   certificate automatically (green **Verified** badge).
3. Wait for DNS to propagate (minutes):
   `curl.exe -I https://downloadanything.online/api/health`
4. Optional later: switch Cloudflare proxy ON (orange) after the cert shows
   Verified, with SSL mode Full — for DDoS protection on the edge.

## Honest expectations on any cloud IP

- ✅ YouTube, Suno, SoundCloud, Vimeo, Reddit, VK, Rumble, Dailymotion,
  Bilibili, Pinterest, Twitch clips, Bluesky…
- ❌ Instagram & TikTok: they rate-limit/ban datacenter IPs, so they will
  fail intermittently (platform-side policy, unfixable from any host).
  The Windows desktop app (phase 2) is the full-strength path for those.
- 💾 512 MB RAM is enough for normal downloads; very long/huge merges via
  ffmpeg are the risk. Upgrade path: the next tier changes a one-click
  Instance-Type switch in Settings (~$/mo, more RAM + always-on).
