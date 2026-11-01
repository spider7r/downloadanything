# Free hosting: Woiden.id NAT VPS + Cloudflare Tunnel
# Facts verified from woiden.id / hax.co.id on 2026-10-31:
#   - free NAT VPS (shared IPv4 + dedicated IPv6, full SSH), unmetered bandwidth
#   - IPv6-only sibling offer at hax.co.id
#   - servers are renewable: extend duration from the web panel (vps-renew)
#   - no credit card anywhere

## Why the Cloudflare Tunnel?
A NAT VPS shares one public IPv4 among many users and gives each VPS only
forwarded ports (datacenter block common ports like 80/443). A Cloudflare
Tunnel needs NO inbound port at all: the VPS dials out to Cloudflare, and
Cloudflare serves your domain from the edge. NAT restriction: neutralized.

## Part 0 — push the repo to GitHub (once, on your Windows PC)

1. https://github.com/new → private repo `download-anything`, no README init
2. PowerShell:
```powershell
cd "E:\Z CODE\download-anything"
git remote add github https://github.com/<YOUR-USERNAME>/download-anything.git
git push -u github master
```

## Part 1 — create the VPS (woiden.id)

1. Register at https://woiden.id/register (email only, no card)
2. https://woiden.id/create-vps/ → choose the free NAT VPS plan
   (pick 1 GB RAM if offered; location nearest: SG/HK/ID datacenters)
3. Wait ~1–2 minutes, then open https://woiden.id/vps-info/ :
   note the **IP**, **SSH port/username**, and **root password**
4. Open a terminal: `ssh root@<IP> -p <SSH-PORT>` (Windows 10+ has ssh)

## Part 2 — server setup (paste as one block in the SSH session)

```bash
# 2.1 base deps + swap (RAM insurance for ffmpeg)
apt update && apt full-upgrade -y
fallocate -l 2G /swapfile && chmod 600 /swapfile \
 && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2.2 Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git ca-certificates curl

# 2.3 fetch + build the app
cd /opt
git clone https://github.com/<YOUR-USERNAME>/download-anything.git
cd download-anything
npm ci --no-audit --no-fund
npm run build:web
# first boot downloads Linux yt-dlp + ffmpeg into apps/server/bin automatically
```

## Part 3 — run it forever (systemd)

```bash
cat >/etc/systemd/system/downloadanything.service <<'EOF'
[Unit]
Description=Download Anything
After=network-online.target

[Service]
WorkingDirectory=/opt/download-anything
Environment=PORT=8787
ExecStart=/usr/bin/node /opt/download-anything/apps/server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now downloadanything
curl -s http://localhost:8787/api/health   # -> {"ok":true,...}
```

## Part 4 — Cloudflare Tunnel (puts it on your domain)

1. Cloudflare dashboard (domain `downloadanything.online`) → **Zero Trust →
   Networks → Tunnels → Create a tunnel → Cloudflared** → name `da-server`
2. Copy the long **token** from the install command it shows
3. On the VPS:
```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared service install <PASTE-TOKEN-HERE>
```
4. Back in the Cloudflare tunnel page → **Public Hostname**:
   - subdomain `` (root) → domain `downloadanything.online`
   - service: `http://localhost:8787`
   → Save. HTTPS on your domain goes live in ~1 minute
5. Test from your PC:
   `curl.exe -I https://downloadanything.online/api/health`

## Part 5 — the ONE maintenance task

- The free VPS expires every few days → renew it:
  https://woiden.id/vps-renew/ → pick the VPS → **Renew**
  (Telegram group/channel posts reminders: t.me/haxserver)
- Everything else (tunnel, node, systemd) re-attaches automatically; binaries/persist as long as you renew BEFORE expiry

## Updates later

```bash
cd /opt/download-anything && git pull && npm ci --no-audit --no-fund \
 && npm run build:web && systemctl restart downloadanything
```

## Honest expectations (datacenter IP, same as every cloud host)

- ✅ YouTube, Suno, SoundCloud, Vimeo, Reddit, VK, Rumble, Dailymotion,
  Bilibili, Pinterest, Twitch clips, Bluesky, …
- ❌ Instagram & TikTok: datacenter-IP rate limits (platform policy).
  The Windows desktop app (phase 2) is the full-strength path for those.
