# Download Anything

Free, no-signup media downloader — web app + Windows desktop app.

Powered by the open-source engines [yt-dlp](https://github.com/yt-dlp/yt-dlp) and FFmpeg.

## Structure

```
apps/
  web/       Branded website + in-browser downloader (React + Vite + Tailwind, static build)
  server/    Node.js API that runs yt-dlp/ffmpeg server-side
  desktop/   Windows desktop app (Electron) — phase 2
```

## Quick start (dev)

```
pnpm install
pnpm dev:server   # API on http://localhost:8787
pnpm dev:web      # site on http://localhost:5173 (proxies /api)
```

## Deployment note

The downloader API needs a real server (VPS, Railway, Render, Fly.io) because it
executes yt-dlp — serverless platforms like Vercel/Netlify won't run it.
The `apps/web` output is a static site and can be hosted anywhere.

**Legal:** only download content you own rights to or that the source permits.
Respect each platform's Terms of Service and applicable copyright law.
