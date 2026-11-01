# Free hosting plan — Hugging Face Spaces (no credit card)

Best genuinely-free host for this app: **huggingface.co Spaces**, Docker SDK.
Free tier: 2 vCPU, 16 GB RAM, 50 GB disk, no card, HTTPS + public URL included.

## Step-by-step (10 minutes)

1. **Account**: create one at https://huggingface.co/join (free, email only).

2. **Create the Space**: https://huggingface.co/new-space
   - Space name: `download-anything`
   - License: any (e.g. mit)
   - **Select the Space SDK: Docker → (Blank template)**
   - Visibility: **Public** (public is required on the free tier)

3. **Push the project** INTO the Space (the Space is a normal git repo):

```bash
git clone https://huggingface.co/spaces/<YOUR-USERNAME>/download-anything
cd download-anything
git remote add app "E:\Z CODE\download-anything"   # local repo
git pull app master --allow-unrelated-histories
git add . && git commit -m "Upload app"
git push
```

   The repo already contains everything the Space needs:
   - `README.md` (Space metadata front-matter at the top)
   - `Dockerfile` (single container: builds web, serves site + API on port 7860)
   - `.dockerignore` (fast, small build)
   The container auto-downloads the Linux yt-dlp + ffmpeg binaries on first boot.

4. **Wait ~2–3 minutes** for the build. Then open:
   `https://<YOUR-USERNAME>-download-anything.hf.space`

5. **Keep it awake (optional but free)**: the Space sleeps after ~48 h of no
   visits. Create a free keep-alive ping at https://cron-job.org
   (1 request/hour to `https://<…>.hf.space/api/health`) and set it never to sleep.

## Point `downloadanything.online` at it (free)

HF Spaces only serve `*.hf.space`, so proxy your domain through Cloudflare
(free):
1. Move DNS for `downloadanything.online` to Cloudflare (free plan).
2. DNS: A record `@` → `192.0.2.1` (dummy) with the orange cloud ON.
3. Workers & Pages → create a Worker → paste the exact code block from
   `deploy/HF-SPACE.md` (proxy to your Space URL) → route it to
   `downloadanything.online/*`. 100 000 requests/day free.

## Honest expectations on any cloud IP
- Works great: YouTube, Suno, SoundCloud, Vimeo, Reddit, VK, Rumble,
  Dailymotion, Bilibili, Pinterest, Twitch clips, Bluesky, …
- Rate-limited/blocked: Instagram & TikTok (they block datacenter IPs).
  The Windows desktop app is the full-strength path for those two.
