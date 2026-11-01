---
title: Download Anything
emoji: 📥
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# Download Anything — Space

Free Docker Space hosting the full site (web + API in one container).
The container auto-downloads the Linux **yt-dlp** and **ffmpeg** binaries on
first boot, so no manual setup is required.

## Deploy (no credit card needed)
1. Create a free account at huggingface.co
2. Create a new **Space** → SDK: **Docker** → Dup: this repo, or upload:
   - this `README.md`
   - `deploy/Dockerfile` renamed to just `Dockerfile` at the repo ROOT
   - `package.json`, `package-lock.json`, `apps/` source (web + server)
3. Wait for the build (~2 min). Your site is live at
   `https://<your-username>-download-anything.hf.space`

## Notes
- The Space sleeps after ~48 h of no visits; first visitor wakes it (~1 min).
- Free tier: 2 vCPU / 16 GB RAM — plenty for yt-dlp + ffmpeg.
- Custom domain: HF Spaces use `*.hf.space`. To serve `downloadanything.online`
  with your domain, use the tiny Cloudflare Worker proxy below (free tier).

```js
// Cloudflare Worker: proxy your domain -> the Space (free 100k req/day)
export default {
  async fetch(req) {
    const u = new URL(req.url);
    const space = "https://YOUR-USERNAME-download-anything.hf.space";
    return fetch(space + u.pathname + u.search, {
      method: req.method,
      headers: new Headers(req.headers),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "follow",
    });
  },
};
```
