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
        filesize_approx: f.filesize_approx || null,
        tbr: f.tbr || null,
        abr: f.abr || null,
        format_note: f.format_note || null,
      }))
      .filter((f) => f.ext !== "mhtml");
    res.json({
      title: info.title || info.id || "Untitled",
      uploader: info.uploader || info.uploader_id || info.channel || null,
      channel: info.channel || info.uploader || null,
      channel_subs: info.channel_follower_count ?? info.subscriber_count ?? null,
      description:
        typeof info.description === "string" ? info.description.slice(0, 900) : null,
      view_count: info.view_count ?? null,
      like_count: info.like_count ?? null,
      upload_date: info.upload_date ?? null, // YYYYMMDD
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
  return [
    "--newline",
    "--progress",
    "--quiet", // suppress banner lines; progress lines still print
    "-f",
    format,
    "--no-playlist",
    "--no-warnings",
    "--no-mtime",
    "--restrict-filenames",
    "--no-part",
    "-o",
    "%(title).80B.%(ext)s",
    ...(FFMPEG_PATH ? ["--ffmpeg-location", FFMPEG_PATH] : []),
    ...(wantMp3 ? ["-x", "--audio-format", "mp3", "--audio-quality", "0"] : []),
    url,
  ];
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

  const child = spawn(YTDLP_PATH, makeDownloadArgs(req.body.url.trim(), format, wantMp3), {
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

  child.on("close", async (code) => {
    if (job.status === "error") return; // already set (cancelled)
    if (code === 0) {
      try {
        const files = (await fsp.readdir(workDir)).filter((f) => !f.startsWith("."));
        if (!files.length) throw new Error("Download produced no file");
        job.filename = files[0];
        job.title = job.filename;
        job.percent = 100;
        job.status = "done";
        console.log(`[job ${id}] done -> ${job.filename}`);
      } catch (err) {
        job.status = "error";
        job.error = err.message || "No file produced";
      }
    } else {
      job.status = "error";
      job.error = cleanErr(job.lastStderr || "") || `yt-dlp exited with code ${code}`;
      // remove partial dir to save disk
      fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
      job.workDir = null;
    }
  });

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
}, 60_000);

/* --------------- Serve JSON (never HTML) for unknown routes ---------------- */

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

  app.listen(PORT, () => console.log(`\n⚡ Download Anything API listening on http://localhost:${PORT}\n`));
}

main();
