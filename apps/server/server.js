/**
 * Download Anything — downloader API.
 *
 * Runs yt-dlp / FFmpeg (open-source engines) as child processes:
 *   GET  /api/health     -> engine versions
 *   POST /api/info       { url }            -> metadata + available formats
 *   GET  /api/download   ?url=&format=      -> streams the file to the client
 *
 * Binaries are auto-downloaded on first boot into ./bin (yt-dlp is open source;
 * FFmpeg builds are free to distribute). Override with YTDLP_PATH / FFMPEG_PATH env vars.
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
const ARCH = os.arch(); // x64 -> x86_64 binaries

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
      // gyan.dev "essentials" zip; Windows ships bsdtar which can extract zip & xz
      const zip = path.join(BIN_DIR, "ffmpeg.zip");
      await downloadTo("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zip);
      await run("tar", ["-xf", zip, "-C", BIN_DIR], BIN_DIR);
      await fsp.rm(zip, { force: true });
      // find ffmpeg.exe inside extracted folder
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

    // linux / mac: john van sickle static builds (linux amd64/arm64) — tar.xz
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
app.use(express.json({ limit: "1kb" }));
app.disable("x-powered-by");

// naive in-memory rate limit per IP
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const window = hits.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > window.reset) window = { count: 0, reset: now + 60_000 };
  window.count++;
  hits.set(ip, window);
  if (window.count > 30) return res.status(429).json({ error: "Too many requests — try again in a minute." });
  next();
});

let YTDLP_PATH = process.env.YTDLP_PATH || null;
let FFMPEG_PATH = process.env.FFMPEG_PATH || null;

function assertValidUrl(u) {
  if (typeof u !== "string" || !/^https?:\/\/[^\s]+$/i.test(u) || u.length > 2048) {
    throw Object.assign(new Error("Please provide a valid link starting with http(s)://"), { status: 400 });
  }
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
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });
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

function cleanErr(msg) {
  if (!msg) return "";
  return msg
    .replace(/^\[.*?\]\s*/g, "")
    .replace(/^ERROR:\s*/i, "")
    .trim()
    .slice(0, 300);
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

app.post("/api/info", async (req, res) => {
  try {
    assertValidUrl(req.body?.url);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const args = ["-J", "--no-playlist", "--no-warnings", "--no-check-certificates", req.body.url.trim()];
  try {
    const out = await runYtDlp(args, 120_000);
    // stdout may contain only the JSON (warnings go to stderr)
    const start = out.indexOf("{");
    const info = JSON.parse(out.slice(start));
    const formats = (info.formats || [])
      .filter((f) => f.format_id && f.url && ["http", "m3u8", "rtmp"].some((s) => (f.protocol || "").includes(s) || s === "http"))
      .map((f) => ({
        format_id: String(f.format_id),
        ext: f.ext || "",
        height: f.height || null,
        fps: f.fps || null,
        vcodec: f.vcodec || null,
        acodec: f.acodec || null,
        filesize: f.filesize || null,
        filesize_approx: f.filesize_approx || null,
        tbr: f.tbr || null,
        abr: f.abr || null,
        format_note: f.format_note || null,
      }))
      .filter((f) => f.ext !== "mhtml");
    res.json({
      title: info.title || info.id || "Untitled",
      uploader: info.uploader || info.uploader_id || info.channel || null,
      duration: info.duration || null,
      thumbnail: info.thumbnail || null,
      webpage_url: info.webpage_url || req.body.url,
      extractor: info.extractor_key || null,
      formats,
    });
  } catch (err) {
    res.status(422).json({ error: err.message || "Could not analyze this link" });
  }
});

/* --------------------------- download ---------------------------- */

app.get("/api/download", async (req, res) => {
  try {
    assertValidUrl(req.query.url);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (req.client?.destroyed) return;
  const url = String(req.query.url).trim();
  const format = typeof req.query.format === "string" && req.query.format ? req.query.format : "bv*+ba/b";

  // refuse obviously bad format selectors
  if (!/^[\w.+\-*/]{1,64}$/.test(format)) {
    return res.status(400).json({ error: "Invalid format id" });
  }

  const session = crypto.randomBytes(8).toString("hex");
  const workDir = path.join(TMP_DIR, session);
  await fsp.mkdir(workDir, { recursive: true });

  const cleanup = async () => {
    if (res.writableEnded && !res.headersSent) res.status(500);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  };

  req.on("close", () => {
    if (!res.writableEnded) bestEffortKill();
  });

  let child = null;
  const kill = () => child && child.pid && !child.killed && child.kill("SIGKILL");
  const bestEffortKill = kill;

  const args = [
    "-f",
    format,
    "--no-playlist",
    "--no-warnings",
    "-o",
    path.join(workDir, "%(title).80B.%(ext)s"),
    ...(FFMPEG_PATH ? ["--ffmpeg-location", FFMPEG_PATH] : []),
    "--restrict-filenames",
    "--no-part",
    url,
  ];

  try {
    await new Promise((resolve, reject) => {
      child = spawn(YTDLP_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(cleanErr(stderr) || `yt-dlp exited ${code}`)),
      );
    });

    const files = (await fsp.readdir(workDir)).filter((f) => !f.startsWith("."));
    if (!files.length) throw new Error("Download produced no file");
    const file = files[0];
    const filePath = path.join(workDir, file);
    const stat = await fsp.stat(filePath);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    );
    if (res.req.httpVersionMajor === 1) res.setHeader("Content-Length", stat.size);

    const stream = fs.createReadStream(filePath);
    stream.on("error", async () => {
      res.destroy();
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });
    res.on("close", () => {
      stream.destroy();
      fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });
    stream.pipe(res);
  } catch (err) {
    kill();
    await cleanup();
    if (!res.headersSent) res.status(422).json({ error: err.message || "Download failed" });
  }
});

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
    console.log(FFMPEG_PATH ? `[bin] ffmpeg: ${FFMPEG_PATH}` : "[bin] ffmpeg: not available (audio extraction disabled)");
  } catch {}
  await fsp.mkdir(TMP_DIR, { recursive: true });

  app.listen(PORT, () => console.log(`\n⚡ Download Anything API listening on http://localhost:${PORT}\n`));
}

main();
