# Back4App free container deploy — live TODAY (no card, no Telegram, no queue)
# Facts verified from back4app.com pricing (2026-10-31):
#   Free: $0 / container · 0.25 CPU · 256 MB RAM · 100 GB transfer/mo
#   "Custom Docker containers", "Deployment from GitHub" — no credit card.

## Step 1 — GitHub repo (one time; me + you, 3 minutes)
1. https://github.com/new → Repository name: `download-anything`
   → Private is fine → **Create repository** (don't add README).
2. Tell me your GitHub username. I run the push from your PC; GitHub's
   credential popup appears → you just click **Sign in / Authorize**.
   Everything already needed is committed at the repo root:
   `Dockerfile`, `.dockerignore`, full `apps/` source.

## Step 2 — Back4App (your 4 clicks)
1. Sign up: https://www.back4app.com/signup → continue with **GitHub** (1 click)
2. Top menu → **Containers (Web Deployment)** → **Add app**
3. Select the connected `download-anything` repo → branch `master`
4. Configuration screen:
   - **Build type**: Dockerfile (auto-detected at `./Dockerfile`)
   - **Port**: `7860`   (the Dockerfile exposes 7860; server binds $PORT)
   - Health check path: `/api/health`
5. Click **Deploy** → build ≈ 3–5 min → live at
   `https://download-anything-<hash>.b4a.app`

## Step 3 — smoke test (me)
- `GET https://<your-app>.b4a.app/api/health` → `{"ok":true,...}`
- A YouTube + Suno download through the site, live from your link.

## Step 4 — your domain (free, via Cloudflare — we already have the code)
B4A serves `*.b4a.app`. Put `downloadanything.online` in front with the
free Cloudflare Worker proxy (100k req/day):
1. DNS at Cloudflare: A record `@` → `192.0.2.1`, **orange cloud ON**
2. Workers & Pages → Create → paste `deploy/HF-SPACE.md` proxy code, with
   `const space = "https://<your-app>.b4a.app"` → route `downloadanything.online/*`
3. Done: visitors hit your domain; worker forwards to the container.

## Honest notes (256 MB free tier)
- Normal YouTube/Suno/SoundCloud jobs fit comfortably.
- Very large merges (long videos, VP9+AAC ffmpeg remux) can exhaust RAM —
  if that ever matters, the $5 Shared plan (512 MB) is one click in panel.
- Datacenter IP: IG/TikTok stay limited (platform policy, like every cloud host).
- 100 GB/mo transfer is generous for a downloader site at launch scale.
