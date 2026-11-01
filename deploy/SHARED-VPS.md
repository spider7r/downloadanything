# Hosting both apps on your existing Oracle free VPS

One Oracle "Always Free" box can run both apps side by side. Each app runs its
own port; Caddy gives every domain its own automatic HTTPS.

## 1. Install the app (one-time, on the VPS)

```bash
# Node 22 if you don't have it:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git

git clone <your-repo-url> download-anything
cd download-anything
npm ci --no-audit --no-fund
npm run build:web
```

## 2. systemd service (runs it always-on, restarts on crash)

Save as `/etc/systemd/system/downloadanything.service`:

```ini
[Unit]
Description=Download Anything (YouTube/Suno/... downloader)
After=network.target

[Service]
Type=simple
User=<your-vps-user>
WorkingDirectory=/home/<your-vps-user>/download-anything
Environment=PORT=8788
ExecStart=/usr/bin/node /home/<your-vps-user>/download-anything/apps/server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now downloadanything
curl http://localhost:8788/api/health   # should return {"ok":true,...}
```

## 3. Caddy reverse proxy (free HTTPS per domain)

Save as `/etc/caddy/Caddyfile` (merge with the config of your other app):

```
downloadanything.online {
    reverse_proxy 127.0.0.1:8788
}
# ...your other app's site block stays exactly as it is...
```

```bash
sudo systemctl reload caddy
```

## 4. DNS in Cloudflare (free)

A record: `downloadanything.online` → **your VPS IP** (proxy ✓ orange cloud).

## 5. Two commands later (updates)

```bash
cd download-anything
git pull && npm ci --no-audit --no-fund && npm run build:web && sudo systemctl restart downloadanything
```

## Honest expectations
- YouTube, Suno, SoundCloud, Vimeo, VK, Rumble & thousands more work great from the VPS.
- Instagram/TikTok rate-limit datacenter IPs — expect them to degrade; the
  Windows desktop app is the full-strength path for those two.
