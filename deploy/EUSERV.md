# Free hosting: EUServ VS2-free (Germany) + Cloudflare Tunnel
# Facts verified live from euserv.com on 2026-10-31:
#   VS2-free: 1 vCPU @1 GHz · 1 GB RAM · 10 GB HDD · 1 TB traffic/mo
#   Free basic version, IPv6 address included (NO IPv4), full root, no card.
#   Contract: 1 month term, MANUAL renewal -> extend it monthly in the panel.

## The IPv6-only problem — already solved in this guide
EUServ gives only an IPv6 address. Two bridges make it invisible:
1. **Visitors → site**: Cloudflare proxies your domain (orange cloud). CF
   accepts IPv6-only origins and serves visitors over IPv4 without knowing.
2. **Server → the internet (yt-dlp downloads)**: DNS64/NAT64 (nat64.net)
   lets the IPv6-only box resolve and reach IPv4-only hosts (Google CDN etc.).
   Everything is wired in the setup block below.

## Part 0 — push the repo to GitHub (once, on your Windows PC)

1. https://github.com/new → private repo `download-anything`, no README init
2. PowerShell:
```powershell
cd "E:\Z CODE\download-anything"
git remote add github https://github.com/<YOUR-USERNAME>/download-anything.git
git push -u github master
```

## Part 1 — register + order (no card, no Telegram)

1. Register: https://www.euserv.com/en/register.php (email only)
   - use your real data; they verify accounts manually, approval can take
     from hours up to a few days. Don't panic — it's just slow, not broken.
2. After activation log in at https://support.euserv.com
   → Order → **VS2-free** (vServers → VS2 → VS2-free) → cart → order
   (price 0.00 EUR; contract term 1 month, renewal is manual — see Part 6)
3. When the server activates you get a **/128 IPv6** + root password
   (Customer panel → your server → access data).
4. Connect from Windows (works over IPv4 only if YOUR line has IPv6;
   otherwise use the panel's web console or install "m remote" via dual-stack
   hotspot):
   `ssh root@<IPv6-address>%<interface>` — simpler: use the EUServ web console.

## Part 2 — server setup (paste as one block in the SSH session)

```bash
# 2.1 bridge to IPv4 via DNS64/NAT64 (needed for yt-dlp downloads)
echo 'options edns0' >> /etc/resolv.conf
sed -i 's/^nameserver.*/nameserver 2a01:4f8:c2c:123f::1/;t a;$a nameserver 2a00:1098:2b::1' /etc/resolv.conf
# (2a01:4f8:c2c:123f::1 and 2a00:1098:2b::1 = public NAT64/DNS64 resolvers)
ping6 -c1 -n ipv4only.example.net 2>/dev/null || ping -c1 example.net  # sanity

# 2.2 base deps + swap (RAM insurance for ffmpeg)
apt update && apt full-upgrade -y
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2.3 Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git ca-certificates curl

# 2.4 fetch + build the app
cd /opt
git clone https://github.com/<YOUR-USERNAME>/download-anything.git
cd download-anything
npm ci --no-audit --no-fund
npm run build:web   # first boot downloads Linux yt-dlp + ffmpeg automatically
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

## Part 4 — Cloudflare Tunnel (visitor bridge, no inbound ports needed)

1. Cloudflare dashboard (domain `downloadanything.online`) →
   **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared** →
   name `da-server`
2. Copy the long **token** from the install command it shows
3. On the VPS (download the IPv6-compatible binary — same works):
```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared service install <PASTE-TOKEN-HERE>
```
   (cloudflared dials Cloudflare over IPv6 — dual-stack service, works fine)
4. Back in the Cloudflare tunnel page → **Public Hostname**:
   - subdomain `` (root) · domain `downloadanything.online`
   - service: `http://localhost:8787`
   → Save. Live + HTTPS in ~1 minute. Cloudflare answers visitors over IPv4.
5. Test: `curl.exe -I https://downloadanything.online/api/health`

## Part 5 — updates later

```bash
cd /opt/download-anything && git pull && npm ci --no-audit --no-fund \
 && npm run build:web && systemctl restart downloadanything
```

## Part 6 — the ONE maintenance task (monthly)

The free contract has a **1-month manual renewal**: log into
https://support.euserv.com → your VS2-free → **extend/continue** each month
(one click; they email a reminder). Afterwards everything keeps running.

## Honest expectations (datacenter IP, same as every cloud host)

- ✅ YouTube, Suno, SoundCloud, Vimeo, Reddit, VK, Rumble, Dailymotion,
  Bilibili, Pinterest, Twitch clips, Bluesky, …
- ❌ Instagram & TikTok: datacenter-IP rate limits (platform policy).
  The Windows desktop app (phase 2) is the full-strength path for those.
