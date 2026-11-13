function parseSubscriberCount(str) {
  if (!str) return null;
  const m = str.match(/([\d.]+)\s*([KkMmBb]|thousand|million|billion)?\s*subscribers?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(num)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') return Math.round(num * 1_000);
  if (unit === 'm' || unit === 'million') return Math.round(num * 1_000_000);
  if (unit === 'b' || unit === 'billion') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

/**
 * Download Anything — downloader API.
 *
 * Runs yt-dlp / FFmpeg (open-source engines) as child processes:
 *   GET    /api/health            -> engine versions
 *   POST   /api/info              { url }                    -> metadata + every available format
 *   POST   /api/download          { url, format?, mp3? }     -> starts a background download job -> { id }
 *   GET    /api/progress/:id                                 -> live progress of a job
 *   GET    /api/file/:id                                     -> streams the finished file to the browser
 *   DELETE /api/download/:id                                 -> cancels a running job
 *
 * Binaries are auto-downloaded on first boot into ./bin (yt-dlp & FFmpeg builds are free to redistribute).
 * Override with YTDLP_PATH / FFMPEG_PATH env vars.
 */

import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, "bin");
const TMP_DIR = path.join(os.tmpdir(), "download-anything");

process.on("uncaughtException", (err) => console.error("[uncaught]", err));
process.on("unhandledRejection", (err) => console.error("[unhandled]", err));

/* ------------------------------------------------------------------ */
/* Binary management                                                   */
/* ------------------------------------------------------------------ */

const PLATFORM = process.platform; // win32 | linux | darwin
const ARCH = os.arch();

function exeName(name) {
  return PLATFORM === "win32" ? `${name}.exe` : name;
}

async function downloadTo(url, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
  return dest;
}

async function ytDlpUrl() {
  switch (PLATFORM) {
    case "win32":
      return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    case "darwin":
      return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
    default: {
      const suffix = ARCH === "arm64" ? "_linux_aarch64" : "_linux";
      return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp${suffix}`;
    }
  }
}

/** Download + extract a static FFmpeg build; returns path to ffmpeg binary or null. */
async function ensureFfmpeg() {
  const ffmpeg = path.join(BIN_DIR, exeName("ffmpeg"));
  if (fs.existsSync(ffmpeg)) return ffmpeg;

  console.log("[bin] downloading FFmpeg…");
  try {
    if (PLATFORM === "win32") {
      // gyan.dev "essentials" zip; Windows ships bsdtar which can extract zip
      const zip = path.join(BIN_DIR, "ffmpeg.zip");
      await downloadTo("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zip);
      await run("tar", ["-xf", zip, "-C", BIN_DIR], BIN_DIR);
      await fsp.rm(zip, { force: true });
      const walk = async (dir) => {
        for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            const hit = await walk(p);
            if (hit) return hit;
          } else if (e.name.toLowerCase() === "ffmpeg.exe") {
            return p;
          }
        }
        return null;
      };
      const found = await walk(BIN_DIR);
      if (!found) throw new Error("ffmpeg.exe not found in archive");
      await fsp.rename(found, ffmpeg);
      return ffmpeg;
    }

    if (PLATFORM === "linux") {
      const suffix = ARCH === "arm64" ? "arm64" : "amd64";
      const tar = path.join(BIN_DIR, "ffmpeg.tar.xz");
      await downloadTo(
        `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${suffix}-static.tar.xz`,
        tar,
      );
      await run("tar", ["-xJf", tar, "-C", BIN_DIR], BIN_DIR);
      await fsp.rm(tar, { force: true });
      const walk = async (dir, results = []) => {
        for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p, results);
          else if (e.name === "ffmpeg") results.push(p);
        }
        return results;
      };
      const found = (await walk(BIN_DIR))[0];
      if (!found) throw new Error("ffmpeg binary not found in archive");
      await fsp.rename(found, ffmpeg);
      await fsp.chmod(ffmpeg, 0o755).catch(() => {});
      return ffmpeg;
    }
  } catch (err) {
    console.warn("[bin] FFmpeg auto-download failed:", err?.message || err);
  }
  return null;
}

async function ensureYtDlp() {
  const ytdlp = path.join(BIN_DIR, exeName("yt-dlp"));
  if (!fs.existsSync(ytdlp)) {
    console.log("[bin] downloading yt-dlp…");
    await downloadTo(await ytDlpUrl(), ytdlp);
    if (PLATFORM !== "win32") await fsp.chmod(ytdlp, 0o755).catch(() => {});
  }
  return ytdlp;
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "ignore", shell: PLATFORM === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const app = express();
app.use(cors({ origin: process.env.APP_ORIGIN || true }));
app.use(express.json({ limit: "4kb" }));
app.disable("x-powered-by");

// naive in-memory rate limit per IP
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  let window = hits.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > window.reset) window = { count: 0, reset: now + 60_000 };
  window.count++;
  hits.set(ip, window);
  if (window.count > 60) return res.status(429).json({ error: "Too many requests — try again in a minute." });
  next();
});

let YTDLP_PATH = process.env.YTDLP_PATH || null;
let FFMPEG_PATH = process.env.FFMPEG_PATH || null;

function assertValidUrl(u) {
  if (typeof u !== "string" || !/^https?:\/\/[^\s]+$/i.test(u) || u.length > 2048) {
    throw Object.assign(new Error("Please provide a valid link starting with http(s)://"), { status: 400 });
  }
}

/* Decode the handful of HTML entities IG meta tags use. */
function htmlUnescape(s) {
  if (!s) return "";
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&bullet;/g, "•")
    .replace(/&sol;/g, "/");
}

/* "161" / "12,345" / "1.5M" -> number */
function parseSocialCount(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^([\d.,]+)\s*([kKmM]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6 }[m[2].toLowerCase()];
  return Math.round(mult ? n * mult : n);
}

function runYtDlp(args, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else {
        const reason =
          stderr
            .split("\n")
            .filter((l) => l.includes("ERROR"))
            .pop() || stderr.trim();
        reject(new Error(cleanErr(reason) || `yt-dlp exited with code ${code}`));
      }
    });
  });
}

/* Translate engine errors into honest, human guidance. */
function friendlyError(msg) {
  if (!msg) return "Something went wrong while processing this link";
  if (/ip address is blocked|blocked from accessing|rate.?limit/i.test(msg)) {
    return "This platform blocks requests from cloud/server IPs and only serves real connections. The upcoming Windows desktop app downloads from your own connection and bypasses this — try it there, or retry in a few minutes.";
  }
  if (/empty media response|not available/i.test(msg)) {
    return "Instagram can't show this post without a logged-in account — it may be private, deleted, or restricted. Public posts download fine. The upcoming Windows desktop app will unlock these using your own logged-in session.";
  }
  if (/login|sign in|log in|cookies|authenticate|private video|not available in your country/i.test(msg)) {
    return "This content needs a logged-in session — we even retried with your browser's cookies without success from this connection. The upcoming Windows desktop app handles this natively. Public posts still work.";
  }
  if (/unsupported url|not a valid url|is not a valid/i.test(msg)) {
    return "We couldn't recognize this link. Paste a direct link to the video/post from a supported platform.";
  }
  if (/timed out/i.test(msg)) {
    return "The platform took too long to respond — please try again.";
  }
  if (/http error 5\d\d/i.test(msg)) {
    return "The platform is having temporary server trouble — please try again in a minute.";
  }
  return msg
    .replace(/^ERROR:\s*\[[^\]]+\]\s*/i, "")
    .replace(/\s*See https:\S+.*$/i, "")
    .replace(/\.\s*Otherwise, if .*$/is, "")
    .trim();
}

/* Auth/IP walls (Instagram, TikTok, …) often unlock with the user's own logged-in
 * browser session — yt-dlp's own recommendation. Retry once with cookies.      */
const AUTH_WALL_RE =
  /login|sign in|cookies|rate.?limit|empty media response|ip address is blocked|blocked from accessing|authenticate|use --cookies|private video|not available in your country/i;
const COOKIE_BROWSERS = ["chrome", "edge", "firefox", "brave", "opera"];

/* Optional logged-in YouTube session: paste a Netscape-format cookies.txt
 * (exported from youtube.com) into the YT_COOKIES environment variable on
 * your hosting dashboard. It lives only on the server — never in the repo
 * and never sent to browsers. Fixes YouTube's datacenter-IP bot walls.    */
let YT_COOKIE_FILE = null;
if (process.env.YT_COOKIES && process.env.YT_COOKIES.trim().length > 40) {
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    YT_COOKIE_FILE = path.join(TMP_DIR, "yt-cookies.txt");
    fs.writeFileSync(
      YT_COOKIE_FILE,
      process.env.YT_COOKIES.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "") + "\n",
    );
    console.log("[cookies] YT_COOKIES detected — applied to YouTube requests");
  } catch (err) {
    console.log("[cookies] could not write cookie file:", err.message);
    YT_COOKIE_FILE = null;
  }
}

function isAuthWall(msg) {
  return !!msg && AUTH_WALL_RE.test(msg);
}

async function runYtDlpSmart(args, timeoutMs = 90_000) {
  try {
    return await runYtDlp(args, timeoutMs);
  } catch (err) {
    if (!isAuthWall(err?.message)) throw err;
  }
  // Fallback ladder for auth/IP walls (datacenter IPs especially):
  // 1. the host-provided YouTube session (YT_COOKIES env → cookie file)
  // 2. alternate player clients yt-dlp supports (different bot-check path)
  // 3. local browser cookies (works on desktop/VPS with browsers installed)
  const attempts = [];
  if (YT_COOKIE_FILE) attempts.push(["--cookies", YT_COOKIE_FILE, "the saved session"]);
  if (/youtu(?:\.be|be\.com)/i.test(args.join(" "))) {
    attempts.push(["--extractor-args", "youtube:player_client=tv_simply", "the TV player client"]);
    attempts.push(["--extractor-args", "youtube:player_client=android_vr", "the VR player client"]);
  }
  let lastErr = null;
  for (const [flag, value, label] of attempts) {
    try {
      console.log(`[info] auth wall — retrying with ${label}…`);
      return await runYtDlp([...args, flag, value], timeoutMs);
    } catch (retryErr) {
      if (!isAuthWall(retryErr?.message || "")) throw retryErr; // real content error → stop
      lastErr = retryErr;
    }
  }
  for (const browser of COOKIE_BROWSERS) {
    try {
      console.log(`[info] auth wall — retrying with ${browser} cookies…`);
      return await runYtDlp([...args, "--cookies-from-browser", browser], timeoutMs);
    } catch (retryErr) {
      // DPAPI/missing-browser errors → try the next browser; real content errors → stop
      if (!/decrypt|dpapi|could not find|failed to (copy|find)|does not exist/i.test(retryErr?.message || "")) {
        throw retryErr;
      }
    }
  }
  throw lastErr || new Error("This content needs a logged-in session");
}

function cleanErr(msg) {
  if (!msg) return "";
  return msg
    .replace(/^\[.*?\]\s*/g, "")
    .replace(/^ERROR:\s*/i, "")
    .trim()
    .slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Channel extras (avatar / followers / following) — best-effort,      */
/* using only publicly, legally available data. Never breaks /api/info.*/
/* ------------------------------------------------------------------ */

const UA_PAGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function safeNav(url, opts = {}) {
  return fetch(url, { signal: AbortSignal.timeout(6500), ...opts });
}

/** Collapse the multi-layer escaping Suno/Next.js use so regexes are readable. */
function unescapeAll(s) {
  let prev;
  for (let i = 0; i < 5; i++) {
    prev = s;
    s = s.replace(/\\(.)/g, "$1");
    if (s === prev) break;
  }
  return s;
}

/* --------------------------- Suno support ------------------------------ */
/* Suno song pages embed the full public song object (title, cover art,    */
/* play/like counts, creator, avatar, duration) plus direct player URLs.   */

function sunoSongFromText(flat, idx) {
  const before = flat.slice(Math.max(0, idx - 1400), idx);
  const after = flat.slice(idx, idx + 3000);

  const last = (re, hay) => {
    const g = new RegExp(re.source, `${re.flags}g`);
    let out = null;
    for (const mm of hay.matchAll(g)) out = mm[1];
    return out ?? null;
  };
  const first = (re, hay) => (hay.match(re) || [])[1] ?? null;

  const audioMedia = first(/"media_urls":\[\{"url":"([^"]+)"/, after);
  let audioUrl = first(/"audio_url":"([^"]+)"/, after);
  if (audioUrl && audioUrl.includes("/api/forbidden")) audioUrl = null;
  const title = last(/"title":"([^"]{1,300})"/, before);
  const id = last(/"id":"([0-9a-f-]{36})"/, before);
  if (!id && !title) return null;
  return {
    id: id || (title && title.toLowerCase().replace(/\s+/g, "-")) || null,
    title: title || "Suno song",
    playCount: Number(last(/"play_count":(\d+)/, before) || 0),
    likeCount: Number(last(/"upvote_count":(\d+)/, before) || 0),
    audioUrl: audioMedia || audioUrl,
    videoUrl: first(/"video_url":"([^"]+\.mp4)"/, after),
    image: first(/"image_large_url":"([^"]+)"/, after) || first(/"image_url":"([^"]+)"/, after),
    duration: Number(first(/"duration":([0-9.]+)/, after) || 0),
    model: first(/"major_model_version":"([^"]+)"/, after) || null,
    tags: first(/"tags":"([^"]{0,300})"/, after),
    creator: first(/"display_name":"([^"]{1,120})"/, after) || null,
    handle: first(/"handle":"([^"]{1,120})"/, after) || null,
    avatar: first(/"avatar_image_url":"([^"]+)"/, after),
    createdAt: first(/"created_at":"([^"]+)"/, after),
    public: last(/"is_public":(true|false)/, before) !== "false",
  };
}

async function sunoSongs(url) {
  const res = await safeNav(url, {
    headers: { "User-Agent": UA_PAGE, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Suno returned HTTP ${res.status}`);
  const flat = unescapeAll(await res.text());
  const songs = [];
  const re = /"entity_type":"song_schema"/g;
  let m;
  while ((m = re.exec(flat)) && songs.length < 6) {
    const s = sunoSongFromText(flat, m.index);
    if (s && s.title && (s.audioUrl || s.videoUrl)) songs.push(s);
  }
  if (!songs.length) {
    throw new Error(
      "No public song found on this Suno link — the song may be Private/Link-Only or not shared yet.",
    );
  }
  return songs;
}

function sunoInfoResponse(songs, reqUrl) {
  const s = songs[0];
  const d = s.createdAt ? s.createdAt.slice(0, 10) : null; // 2024-12-17
  const uploadDate = d ? `${d.slice(0, 4)}${d.slice(5, 7)}${d.slice(8, 10)}` : null;
  const tags = s.tags ? s.tags.split(/,\s*/).slice(0, 8).join(", ") : null;
  const isPlaylist = /suno\.com\/playlist\//i.test(reqUrl);
  const description = [
    tags ? `Tags: ${tags}` : null,
    s.model ? `Generated with Suno ${s.model}` : null,
    isPlaylist
      ? `This playlist contains ${songs.length} public song${songs.length === 1 ? "" : "s"} — showing the first. Paste an individual song link (suno.com/song/…) to pick another one.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const formats = [
    ...(s.videoUrl
      ? [
          {
            format_id: "suno-mp4",
            ext: "mp4",
            height: 1080,
            fps: null,
            vcodec: "h264",
            acodec: "mp4a.40.2",
            filesize: null,
            filesize_approx: null,
            tbr: null,
            abr: null,
            format_note: "video + audio",
          },
          {
            format_id: "suno-audio",
            ext: "m4a",
            height: null,
            fps: null,
            vcodec: null,
            acodec: "aac",
            filesize: null,
            filesize_approx: null,
            tbr: null,
            abr: null,
            format_note: "audio only (extracted)",
          },
        ]
      : s.audioUrl
        ? [
            {
              format_id: "suno-audio",
              ext: "m4a",
              height: null,
              fps: null,
              vcodec: null,
              acodec: "mp4a.40.2",
              filesize: null,
              filesize_approx: null,
              tbr: null,
              abr: null,
              format_note: "original quality",
            },
          ]
        : []),
  ];
  return {
    title: s.title,
    uploader: s.creator || s.handle,
    channel: s.creator || s.handle,
    channel_subs: null,
    channel_avatar: s.avatar || null,
    channel_url: s.handle ? `https://suno.com/@${s.handle}` : null,
    channel_followers: null,
    channel_following: null,
    channel_verified: null,
    description,
    view_count: s.playCount || null,
    like_count: s.likeCount || null,
    upload_date: uploadDate,
    duration: s.duration || null,
    thumbnail: s.image || null,
    webpage_url: s.id ? `https://suno.com/song/${s.id}` : reqUrl,
    extractor: "Suno",
    formats,
  };
}

/* ---------------------- platform avatar enrichment ---------------------- */

async function unavatar(provider, username) {
  if (!username) return null;
  const u = `https://unavatar.io/${provider}/${encodeURIComponent(username)}?fallback=false`;
  try {
    const res = await safeNav(u, { method: "HEAD" });
    return res.ok ? u : null;
  } catch {
    return null;
  }
}

async function enrichChannel(pageUrl, info) {
  const extra = { avatar: null, followers: null, following: null, verified: null, url: null, private: null };
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./, "");

    // 1) Fields some extractors provide directly
    if (info.uploader_thumbnail) extra.avatar = info.uploader_thumbnail;
    if (info.channel_thumbnail && !extra.avatar) extra.avatar = info.channel_thumbnail;
    if (info.user_thumbnail && !extra.avatar) extra.avatar = info.user_thumbnail;
    // Creators' own profile link when the extractor publishes it
    if (info.uploader_url) extra.url = info.uploader_url;
    else if (info.channel_url) extra.url = info.channel_url;

    if (/(?:youtube\.com|youtu\.be)/i.test(host) || /youtube/i.test(info.extractor_key || info.extractor || "")) {
      // channel avatar & real subscribers live in the watch page's owner renderer
      const ytTargetUrl = info.webpage_url || pageUrl;
      if (ytTargetUrl) {
        try {
          const page = await safeNav(ytTargetUrl, {
            headers: { "User-Agent": UA_PAGE, "Accept-Language": "en-US,en;q=0.9" },
          });
          if (page.ok) {
            const raw = await page.text();
            const ownerIdx = raw.indexOf("videoOwnerRenderer");
            const searchRegion = ownerIdx !== -1 ? raw.slice(ownerIdx, ownerIdx + 80000) : raw;

            // Extract high-res channel avatar (note: path chars / and .
            // must be allowed or the match truncates at ".../ytc").
            const avatarMatch = searchRegion.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[a-zA-Z0-9_\-.\/]+/);
            if (avatarMatch) {
              extra.avatar = avatarMatch[0].replace(/=s\d+[^"]*/, "=s400");
            }

            // Channel profile link fallback
            if (!extra.url) {
              const canonMatch = searchRegion.match(/"canonicalBaseUrl":"([^"]+)"/);
              if (canonMatch) {
                extra.url = `https://www.youtube.com${canonMatch[1]}`;
              }
            }

            // Verified check
            if (searchRegion.includes("CHECK_CIRCLE_FILLED") || searchRegion.includes("Verified")) {
              extra.verified = true;
            }

            // Real subscriber count (e.g. "256K subscribers" or "256 thousand subscribers")
            const subMatch = searchRegion.match(/([\d.]+\s*(?:[KkMmBb]|thousand|million|billion)?\s*subscribers?)/i) ||
                             raw.match(/([\d.]+\s*(?:[KkMmBb]|thousand|million|billion)?\s*subscribers?)/i);
            if (subMatch) {
              const parsed = parseSubscriberCount(subMatch[1]);
              if (parsed != null && parsed > 0) {
                extra.followers = parsed;
              }
            }
          }
        } catch {
          /* best effort */
        }
        // Still nothing? The channel's own page is public and always
        // carries the avatar in its og:image.
        if (!extra.avatar && extra.url) {
          try {
            const ch = await safeNav(extra.url, {
              headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Accept-Language": "en-US,en;q=0.9",
              },
            });
            if (ch.ok) {
              const og = (await ch.text()).match(/<meta property="og:image" content="([^"]+)"/)?.[1];
              if (og) extra.avatar = og.replace(/=s\d+[^"=\s]*/, "=s400");
            }
          } catch {
            /* best effort */
          }
        }
      }
    } else if (/instagram\./.test(host)) {
      /* yt-dlp reports the DISPLAY name ("MR ABU"), not the handle ("mrabu99").
       * Profile URLs carry the handle in the path; for post URLs resolve it
       * from the post's own link-preview meta tags.                          */
      const pathUser = u.pathname.split("/").filter(Boolean)[0];
      let igUser =
        pathUser && !/^(p|reel|reels|tv|explore)$/i.test(pathUser)
          ? pathUser
          : ((info.uploader || info.channel || "").replace(/^@/, "") || "");
      if (/^(p|reel|reels|tv)$/i.test(pathUser || "") && info.uploader) {
        try {
          const meta = await safeNav(u.href.split("?")[0], {
            headers: {
              "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
          if (meta.ok) {
            const raw = await meta.text();
            const title = htmlUnescape(raw.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || "");
            igUser = title.match(/^([^(@\n]+?)\s+on Instagram:/)?.[1]?.trim().replace(/^@/, "") || igUser;
          }
        } catch {
          /* keep display name as best guess */
        }
      }
      if (igUser) {
        let getUser = null;
        try {
          const res = await safeNav(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(igUser)}`,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "X-IG-App-ID": "936619743392459",
                "Accept-Language": "en-US,en;q=0.9",
              },
            },
          );
          if (res.ok) {
            const j = await res.json();
            getUser = j?.data?.user || null;
          }
        } catch {
          /* fall through to unavatar */
        }
        if (getUser) {
          extra.avatar = getUser.profile_pic_url || getUser.profile_pic_url_hd || null;
          if (getUser.is_private) {
            // Private accounts hide follower/following data from logged-out visitors.
            extra.private = true;
            extra.following = "Private";
          } else {
            extra.followers = getUser.edge_followed_by?.count ?? null;
            extra.following = getUser.edge_follow?.count ?? null;
          }
          extra.verified = getUser.is_verified ?? null;
          if (getUser.username) extra.url = `https://www.instagram.com/${getUser.username}/`;
        } else {
          // IG API rate-limited → the crawler (link-preview) variant of the
          // profile page is open to everyone and carries the real avatar and
          // public follower/following counts in its og: meta tags.
          let crawlOk = false;
          try {
            const crawl = await safeNav(`https://www.instagram.com/${igUser}/`, {
              headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Accept-Language": "en-US,en;q=0.9",
              },
            });
            if (crawl.ok) {
              crawlOk = true;
              const raw = await crawl.text();
              extra.avatar ??= htmlUnescape(raw.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || "") || null;
              const desc = htmlUnescape(raw.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || "");
              extra.followers ??= parseSocialCount(desc.match(/([\d.,]+\s*[kKmM]?)\s*Followers/i)?.[1]);
              extra.following ??= parseSocialCount(desc.match(/([\d.,]+\s*[kKmM]?)\s*Following/i)?.[1]);
            }
          } catch {
            /* fall through to unavatar */
          }
          // Can't see the data at all → follow IG's logged-out convention.
          if (!crawlOk) extra.following = "Private";
          if (!extra.avatar) extra.avatar = await unavatar("instagram", igUser);
        }
        if (!extra.url && igUser) extra.url = `https://www.instagram.com/${igUser}/`;
      }
    } else if (/tiktok\./.test(host)) {
      const handle =
        (info.uploader_id || info.uploader || u.pathname.match(/@([\w.]+)/)?.[1] || "").replace(/^@/, "");
      if (handle) {
        extra.url = `https://www.tiktok.com/@${handle}`;
        try {
          const page = await safeNav(`https://www.tiktok.com/@${handle}`, {
            headers: { "User-Agent": UA_PAGE, "Accept-Language": "en-US,en;q=0.9" },
          });
          if (page.ok) {
            const flat = unescapeAll(await page.text());
            extra.avatar ??= flat.match(/"avatarLarger":"([^"]+)"/)?.[1] || null;
            extra.followers ??= Number(flat.match(/"followerCount":(\d+)/)?.[1]) || null;
            extra.following ??= Number(flat.match(/"followingCount":(\d+)/)?.[1]) || null;
            if (/"privateAccount":true/.test(flat)) {
              extra.private = true;
              extra.following = "Private";
            }
            extra.verified ??= /"verified":true/.test(flat) ? true : null;
          }
        } catch {
          /* best effort */
        }
        if (!extra.avatar) extra.avatar = await unavatar("tiktok", handle);
      }
    } else if (/bsky\.app/.test(host)) {
      const handle = u.pathname.match(/\/profile\/([^/]+)/)?.[1];
      if (handle) {
        extra.url = `https://bsky.app/profile/${handle}`;
        try {
          const didRes = await safeNav(
            `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
          );
          if (didRes.ok) {
            const did = (await didRes.json()).did;
            const prof = await safeNav(
              `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
            );
            if (prof.ok) {
              const p = await prof.json();
              extra.avatar = p.avatar || null;
              extra.followers = p.followers_count ?? null;
              extra.following = p.follows_count ?? null;
            } else {
              extra.avatar = await unavatar("bsky", handle);
            }
          }
        } catch {
          /* best effort */
        }
      }
    } else if (/facebook\.com/.test(host)) {
      const fbUser =
        (info.uploader || "").replace(/^@/, "") ||
        u.pathname.match(/profile\.php\?id=(\d+)/)?.[1] ||
        null;
      if (!extra.url && fbUser) extra.url = `https://www.facebook.com/${fbUser}/`;
      extra.avatar = await unavatar("facebook", fbUser);
    } else if (/(^|\.)(x|twitter)\.com/.test(host)) {
      const xUser =
        (info.uploader_id || info.uploader || "").replace(/^@/, "") ||
        u.pathname.match(/\/(@?[\w]+)(?:\/|$)/)?.[1]?.replace(/^@/, "") ||
        null;
      if (xUser && !extra.url) extra.url = `https://x.com/${xUser}`;
      // "x" provider (unavatar's "twitter" path is legacy); PATCH verified live
      extra.avatar = await unavatar("x", xUser);
    } else if (/reddit\.com/.test(host)) {
      const sub = (u.pathname.match(/\/r\/([\w-]+?)(?:\/|$)/) || [])[1] || null;
      const rd = sub || (info.uploader || "").replace(/^u\//, "") || (u.pathname.match(/\/user\/([\w-]+)/) || [])[1] || null;
      extra.url = sub
        ? `https://www.reddit.com/r/${sub}/`
        : rd
          ? `https://www.reddit.com/user/${rd}/`
          : extra.url;
      extra.avatar = await unavatar("reddit", rd);
    }
  } catch {
    /* enrichment is strictly best-effort */
  }
  return extra;
}

/* ---------------------------- health ----------------------------- */

app.get("/api/health", async (_req, res) => {
  try {
    const version = (await runYtDlp(["--version"], 20_000)).trim();
    res.json({ ok: true, ytDlp: version, ffmpeg: !!FFMPEG_PATH });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

/* ----------------------------- info ------------------------------ */

const INFO_JOBS = new Map(); // id -> { status: "working"|"done"|"error", info, error, createdAt }
const INFO_TTL_MS = 5 * 60 * 1000;

async function computeInfo(url) {
  // Suno song/playlist pages embed everything publicly — no yt-dlp needed.
  if (/^https?:\/\/(?:www\.)?suno\.com/i.test(url)) {
    const songs = await sunoSongs(url);
    return sunoInfoResponse(songs, url);
  }

  const args = ["-J", "--no-playlist", "--no-warnings", "--no-check-certificates", url];
  const out = await runYtDlpSmart(args, 120_000);
  const start = out.indexOf("{");
  const info = JSON.parse(out.slice(start));
  const formats = (info.formats || [])
    .filter((f) => f.format_id && f.url)
    .filter((f) => {
      const proto = f.protocol || "";
      return proto.includes("http") || proto.includes("m3u8") || proto.includes("rtmp");
    })
    .map((f) => ({
      format_id: String(f.format_id),
      ext: f.ext || "",
      height: f.height || null,
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      filesize: f.filesize || null,
      // Estimate size from bitrate × duration when yt-dlp publishes neither —
      // users should never see a made-up number, only an honest approximation.
      filesize_approx:
        f.filesize_approx ||
        (f.tbr && info.duration ? Math.round((f.tbr * 1000 * info.duration) / 8) : null),
      tbr: f.tbr || null,
      abr: f.abr || null,
      format_note: f.format_note || null,
    }))
    .filter((f) => f.ext !== "mhtml");
  // Channel avatar & follower stats: as much publicly available info as possible.
  const extra = await enrichChannel(url, info);

  return {
    title: info.title || info.id || "Untitled",
    uploader: info.uploader || info.uploader_id || info.channel || null,
    channel: info.channel || info.uploader || null,
    channel_subs: extra.followers ?? info.channel_follower_count ?? info.subscriber_count ?? null,
    channel_avatar: extra.avatar,
    channel_followers: extra.followers ?? info.channel_follower_count ?? info.subscriber_count ?? null,
    channel_following: extra.following,
    channel_verified: extra.verified ?? info.channel_is_verified ?? null,
    channel_url: extra.url ?? null,
    channel_private: extra.private ?? null,
    description:
      typeof info.description === "string" ? info.description.slice(0, 900) : null,
    view_count: info.view_count ?? null,
    like_count: info.like_count ?? null,
    upload_date: info.upload_date ?? null, // YYYYMMDD
    duration: info.duration || null,
    thumbnail: info.thumbnail || null,
    webpage_url: info.webpage_url || url,
    extractor: info.extractor_key || null,
    formats,
  };
}

/* Analysis is a background job like downloads: on slow shared vCPUs yt-dlp can
 * take longer than hosting gateways allow, so the client polls instead of
 * holding one long HTTP request open (fixes 504 Gateway Timeout).            */
app.post("/api/info", (req, res) => {
  try {
    assertValidUrl(req.body?.url);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const url = req.body.url.trim();
  const id = crypto.randomBytes(10).toString("hex");
  const infoJob = { id, status: "working", info: null, error: null, createdAt: Date.now() };
  INFO_JOBS.set(id, infoJob);
  res.json({ id });
  computeInfo(url)
    .then((info) => {
      infoJob.info = info;
      infoJob.status = "done";
    })
    .catch((err) => {
      infoJob.status = "error";
      infoJob.error =
        err.message === "timed out" ? friendlyError("timed out") : friendlyError(err.message || "Could not analyze this link");
    });
});

app.get("/api/info/:id", (req, res) => {
  const infoJob = INFO_JOBS.get(req.params.id);
  if (!infoJob) return res.status(404).json({ error: "Unknown analysis job" });
  res.json({
    status: infoJob.status,
    info: infoJob.status === "done" ? infoJob.info : null,
    error: infoJob.status === "error" ? infoJob.error : null,
  });
});

/* ------------------------------------------------------------------ */
/* Download jobs (background download + live progress + delivery)      */
/* ------------------------------------------------------------------ */

const JOBS = new Map(); // id -> job
const MAX_ACTIVE = 3;
const DONE_TTL_MS = 10 * 60 * 1000;

function publicJob(job) {
  return {
    id: job.id,
    status: job.status, // starting | downloading | converting | done | error | expired
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    filename: job.status === "done" ? job.filename : null,
    title: job.status === "done" ? job.title : null, // filled at end
    error: job.status === "error" ? job.error : null,
  };
}

function activeCount() {
  let n = 0;
  for (const job of JOBS.values()) {
    if (["starting", "downloading", "converting"].includes(job.status)) n++;
  }
  return n;
}

function makeDownloadArgs(url, format, wantMp3) {
  // If format is a video-only format (e.g. '137', 'f137', '248', etc.), merge best audio automatically!
  let resolvedFormat = format;
  if (!wantMp3 && format && !format.includes("+") && !format.includes("/") && !format.startsWith("ba")) {
    resolvedFormat = `${format}+ba[ext=m4a]/ba/b`;
  }

  return [
    "--newline",
    "--progress",
    "--quiet", // suppress banner lines; progress lines still print
    "-f",
    resolvedFormat,
    "--no-playlist",
    "--no-warnings",
    "--no-mtime",
    "--restrict-filenames",
    "--no-part",
    "-o",
    "%(title).80B.%(ext)s",
    ...FFMPEG_PATH ? ["--ffmpeg-location", FFMPEG_PATH] : [],
    ...YT_COOKIE_FILE ? ["--cookies", YT_COOKIE_FILE] : [],
    // Choose a container both codecs actually fit in (VP9+Opus → WebM).
    ...(FFMPEG_PATH ? ["--merge-output-format", "mp4/webm"] : []),
    ...(wantMp3 ? ["-x", "--audio-format", "mp3", "--audio-quality", "0"] : []),
    url,
  ];
}

/* Suno hosts public files on its own CDN; grab them directly instead of yt-dlp. */
function safeName(name) {
  return (
    (name || "suno-song")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "suno-song"
  );
}

function fmtBytes(n) {
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB/s` : `${mb.toFixed(1)} MB/s`;
}

async function directDownload(job, mediaUrl, title, mode, wantMp3) {
  const controller = new AbortController();
  job.abort = controller;
  let child = null;
  try {
    if (job.status === "error") return; // cancelled before we began
    job.status = "downloading";
    const res = await fetch(mediaUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": UA_PAGE },
    });
    if (!res.ok || !res.body) throw new Error(`CDN returned HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length") || 0);
    let out = path.join(job.workDir, `${safeName(title)}.mp4`);
    const fd = await fsp.open(out, "w");
    let got = 0;
    let lastPct = 0;
    let lastTick = Date.now();
    let lastBytes = 0;
    try {
      for await (const chunk of res.body) {
        await fd.write(chunk);
        got += chunk.length;
        const now = Date.now();
        if (now - lastTick > 400) {
          const bps = ((got - lastBytes) * 1000) / (now - lastTick);
          job.speed = fmtBytes(bps);
          job.eta = total ? `${Math.max(1, Math.round((total - got) / Math.max(1, bps)))}s` : "";
          if (total) {
            job.percent = Math.min(100, (got / total) * 100);
          } else {
            lastPct = lastPct + (got - lastBytes) / 20000 + 1;
            job.percent = Math.min(95, lastPct);
          }
          lastTick = now;
          lastBytes = got;
        }
      }
    } finally {
      await fd.close();
    }
    if (total) job.percent = 100;
    else job.percent = 99;

    // mode: "mp4" = deliver as-is | "m4a" = strip video (stream copy) | "mp3" = 320k MP3
    const convert = (args, finalName, errLabel) => {
      if (!FFMPEG_PATH) throw new Error(`${errLabel} needs FFmpeg, which is unavailable on the server`);
      const finalPath = path.join(job.workDir, finalName);
      job.status = "converting";
      job.percent = 99;
      child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
      job.child = child;
      return new Promise((resolve, reject) => {
        let fErr = "";
        child.stderr.on("data", (d) => {
          fErr = (fErr + d.toString()).slice(-1200);
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`ffmpeg: ${cleanErr(fErr) || `exited with code ${code}`}`)),
        );
      });
    };

    if (mode === "mp4") {
      job.filename = path.basename(out);
    } else if (mode === "m4a") {
      await convert(
        ["-y", "-i", out, "-vn", "-acodec", "copy", path.join(job.workDir, `${safeName(title)}.m4a`)],
        `${safeName(title)}.m4a`,
        "Audio extraction",
      );
      job.filename = `${safeName(title)}.m4a`;
      fsp.rm(out, { force: true }).catch(() => {});
    } else {
      const mp3Name = `${safeName(title)}.mp3`;
      await convert(["-y", "-i", out, "-vn", "-b:a", "320k", path.join(job.workDir, mp3Name)], mp3Name, "MP3 conversion");
      job.filename = mp3Name;
      fsp.rm(out, { force: true }).catch(() => {});
    }
    job.title = job.filename;
    job.percent = 100;
    job.status = "done";
    console.log(`[job ${job.id}] suno done -> ${job.filename}`);
  } catch (err) {
    if (job.status === "error") return; // cancelled
    job.status = "error";
    job.error = err?.message || "Suno download failed";
    if (job.workDir) fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
    job.workDir = null;
  }
}

app.post("/api/download", async (req, res) => {
  try {
    assertValidUrl(req.body?.url);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (activeCount() >= MAX_ACTIVE) {
    return res.status(429).json({ error: "Server is busy right now — try again shortly." });
  }

  const format = typeof req.body.format === "string" && req.body.format ? req.body.format : "bv*+ba/b";
  if (!/^[\w.+\-*/]{1,64}$/.test(format)) {
    return res.status(400).json({ error: "Invalid format id" });
  }

  const wantMp3 = req.body.mp3 === true;

  /* Blanket fix for "download has no sound": Instagram (and other platforms)
   * now publish video-only VP9/H.264 streams. A request for one format id gets
   * the best audio attached & merged automatically. The selector falls back
   * gracefully (`<id>+ba` -> `<id>` -> `b`) for muxed- and audio-only ids.     */
  const dlFormat =
    format.includes("+") || /^ba/.test(format) || wantMp3
      ? format
      : `${format}+ba/${format}/b`;
  if (wantMp3 && !FFMPEG_PATH) {
    return res.status(422).json({ error: "MP3 conversion needs FFmpeg, which is unavailable on the server" });
  }

  const id = crypto.randomBytes(10).toString("hex");
  const workDir = path.join(TMP_DIR, id);
  await fsp.mkdir(workDir, { recursive: true });

  const job = {
    id,
    status: "starting",
    percent: 0,
    speed: "",
    eta: "",
    filename: null,
    title: null,
    error: null,
    createdAt: Date.now(),
    child: null,
    workDir,
  };
  JOBS.set(id, job);

  const targetUrl = req.body.url.trim();

  // --- Suno: public files live on Suno's own CDN; grab the CDN MP4 and convert as needed ---
  if (/^https?:\/\/(?:www\.)?suno\.com/i.test(targetUrl)) {
    try {
      const songs = await sunoSongs(targetUrl);
      const s = songs.find((x) => targetUrl.includes(x.id)) || songs[0];
      const mediaUrl = s.videoUrl || s.audioUrl;
      if (!mediaUrl) {
        return res.status(422).json({ error: "This Suno song has no downloadable media URL available" });
      }
      let mode;
      if (format.includes("suno-mp4")) mode = "mp4";
      else if (wantMp3) mode = "mp3";
      else mode = "m4a";
      void directDownload(job, mediaUrl, s.title, mode, wantMp3);
      return res.json({ id });
    } catch (err) {
      JOBS.delete(id);
      if (job.workDir) fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      return res.status(422).json({ error: err.message || "Could not start this Suno download" });
    }
  }

  // First attempt without cookies; retry with the user's logged-in browser
  // cookies when a platform closes the download with an auth/IP wall.
  let attemptIdx = 0; // 0 = plain attempt; n = COOKIE_BROWSERS[n-1] cookies
  const run = () => {
    const args = [...makeDownloadArgs(targetUrl, dlFormat, wantMp3)];
    if (attemptIdx > 0) {
      job.cookieBrowser = COOKIE_BROWSERS[attemptIdx - 1];
      args.push("--cookies-from-browser", job.cookieBrowser);
    }
    const child = spawn(YTDLP_PATH, args, {
      cwd: workDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    job.child = child;

    let lineBuf = "";
    child.stdout.on("data", (d) => {
      lineBuf += d.toString();
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop(); // keep partial
      for (const line of lines) handleYtDlpLine(job, line);
    });

    child.stderr.on("data", (d) => {
      // some yt-dlp progress versions print to stderr with --quiet off; keep last error
      job.lastStderr = (job.lastStderr || "") + d.toString();
      if (job.lastStderr.length > 4000) job.lastStderr = job.lastStderr.slice(-4000);
    });

    child.on("error", (err) => {
      job.status = "error";
      job.error = `yt-dlp failed to start: ${err.message}`;
    });

    child.on("close", (code) => {
      if (job.status === "error") return; // already set (cancelled)
      if (code === 0) {
        fsp
          .readdir(workDir)
          .then((files) => files.filter((f) => !f.startsWith(".")))
          .then((files) => {
            if (!files.length) throw new Error("Download produced no file");
            job.filename = files[0];
            job.title = job.filename;
            job.percent = 100;
            job.status = "done";
            console.log(`[job ${id}] done -> ${job.filename}`);
          })
          .catch((err) => {
            job.status = "error";
            job.error = err.message || "No file produced";
          });
        return;
      }

      const rawErr = cleanErr(job.lastStderr || "") || `yt-dlp exited with code ${code}`;
      // Cookie extraction itself failed (DPAPI/missing browser) → keep trying others
      const cookieToolingErr = /decrypt|dpapi|could not find|failed to (copy|find)|does not exist/i.test(rawErr);
      const mayRetry =
        (attemptIdx === 0 && isAuthWall(rawErr)) ||
        (attemptIdx > 0 && cookieToolingErr && attemptIdx < COOKIE_BROWSERS.length);
      if (mayRetry) {
        attemptIdx += 1;
        job.lastStderr = "";
        job.status = "starting";
        job.percent = 0;
        console.log(`[job ${id}] auth wall — retrying with browser cookies`);
        run();
        return;
      }

      job.status = "error";
      job.error = friendlyError(rawErr);
      // remove partial dir to save disk
      fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
      job.workDir = null;
    });
  };

  run();

  res.json({ id });
});

function handleYtDlpLine(job, line) {
  if (!line) return;

  // [download]  43.9% of 10.26MiB at 2.31MiB/s ETA 00:02
  const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
  if (m) {
    const pct = parseFloat(m[1]);
    if (pct >= job.percent || pct < job.percent - 5) {
      // allow resets (multi-part formats)
      job.percent = pct;
    }
    job.speed = m[3] === "Unknown" ? "" : m[3];
    job.eta = m[4] === "Unknown" ? "" : m[4].startsWith("0:") ? m[4].slice(2) : m[4];
    job.status = "downloading";
    return;
  }
  if (line.startsWith("[Merger]") || line.startsWith("[ExtractAudio]")) {
    job.status = "converting";
    job.percent = 99;
    return;
  }
  const dest = line.match(/\[download\]\s+Destination:\s*(.+)/);
  if (dest) job.lastDest = dest[1];
}

/* ------------------------ cancel ------------------------------- */

app.delete("/api/download/:id", async (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown job" });
  if (!["starting", "downloading", "converting"].includes(job.status)) {
    return res.status(409).json({ error: "Job already finished" });
  }
  job.status = "error";
  job.error = "Cancelled";
  if (job.abort) {
    try {
      job.abort.abort();
    } catch {
      /* ignore */
    }
  }
  if (job.child && !job.child.killed) job.child.kill("SIGKILL");
  if (job.workDir) fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
  job.workDir = null;
  res.json({ ok: true });
});

/* ------------------------ progress ------------------------------ */

app.get("/api/progress/:id", (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown job" });
  res.json(publicJob(job));
});

/* ------------------------- file delivery ------------------------- */

app.get("/api/file/:id", async (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown job" });
  if (job.status !== "done" || !job.filename || !job.workDir) {
    return res.status(409).json({ error: "File not ready" });
  }
  const filePath = path.join(job.workDir, job.filename);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
  );
  if (req.httpVersionMajor === 1) res.setHeader("Content-Length", (await fsp.stat(filePath)).size);

  const stream = fs.createReadStream(filePath);
  const cleanup = () => {
    stream.destroy();
    fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
    job.workDir = null;
    job.status = "expired"; // delivered once; client should re-download if needed
    job.filename = null;
  };
  res.on("close", () => {
    if (!res.writableEnded) {
      stream.destroy();
      fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      job.workDir = null;
      job.status = "expired";
    }
  });
  stream.on("end", cleanup);
  stream.on("error", () => {
    stream.destroy();
    res.destroy();
    fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
    job.workDir = null;
  });
  stream.pipe(res);
});

/* ------------------------ housekeeping --------------------------- */

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of JOBS) {
    if (["done", "error", "expired"].includes(job.status) && now - job.createdAt > DONE_TTL_MS) {
      if (job.workDir) fsp.rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      JOBS.delete(id);
    }
  }
  for (const [id, infoJob] of INFO_JOBS) {
    if (now - infoJob.createdAt > INFO_TTL_MS) INFO_JOBS.delete(id);
  }
}, 60_000);

/* --------------- Serve web frontend if built (Desktop / Production) --------------- */

const WEB_DIST = path.join(__dirname, "../web/dist");
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

/* --------------- Serve JSON for unknown API routes ---------------- */

app.use((req, res) => res.status(404).json({ error: "Unknown endpoint" }));

/* --------------------------- startup ----------------------------- */

const PORT = Number(process.env.PORT || 8787);

async function main() {
  await fsp.mkdir(BIN_DIR, { recursive: true });
  try {
    YTDLP_PATH = YTDLP_PATH || (await ensureYtDlp());
    console.log(`[bin] yt-dlp: ${YTDLP_PATH}`);
  } catch (err) {
    console.error("[bin] failed to acquire yt-dlp:", err.message);
    process.exit(1);
  }
  try {
    FFMPEG_PATH = FFMPEG_PATH || (await ensureFfmpeg());
    console.log(FFMPEG_PATH ? `[bin] ffmpeg: ${FFMPEG_PATH}` : "[bin] ffmpeg: not available (audio conversion disabled)");
  } catch {}
  await fsp.mkdir(TMP_DIR, { recursive: true });

  app.listen(PORT, "0.0.0.0", () => console.log(`\n⚡ Download Anything API listening on http://localhost:${PORT}\n`));
}

main();
