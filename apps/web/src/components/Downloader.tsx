import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  Download,
  Eye,
  Film,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Music,
  Play,
  ThumbsUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  cancelJob,
  fetchInfo,
  pollJob,
  startDownload,
  triggerSave,
  type Job,
  type MediaFormat,
  type MediaInfo,
} from "../api";
import {
  formatDate,
  formatCount,
  platformFromExtractor,
  detectPlatform,
  type Platform,
} from "../lib/platforms";
import PlatformIcon from "./PlatformIcon";
import LogoTicker from "./LogoTicker";

type Phase = "idle" | "loading" | "ready" | "error";

/* ------------------------------ helpers ------------------------------ */

function fmtDuration(s?: number | null): string {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtSize(bytes?: number | null, approx?: number | null): string {
  const exact = bytes ?? 0;
  if (!exact && !approx) return "";
  const b = exact || (approx ?? 0);
  const mb = b / 1024 / 1024;
  const label = !exact && approx ? "~" : "";
  return `${label}${mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(mb < 10 ? 1 : 0) + " MB"}`;
}

function codecName(vcodec?: string | null, acodec?: string | null): string {
  const v = (vcodec || "").toLowerCase();
  const a = (acodec || "").toLowerCase();
  if (v && v !== "none") {
    if (v.includes("avc") || v.includes("h264")) return "H.264";
    if (v.includes("hevc") || v.includes("hvc1") || v.includes("h265")) return "H.265";
    if (v.includes("av01") || v.includes("av1")) return "AV1";
    if (v.startsWith("vp09") || v.includes("vp9")) return "VP9";
    if (v.startsWith("vp08") || v.includes("vp8")) return "VP8";
    if (v.includes("vp9")) return "VP9";
    if (v.includes("vp8")) return "VP8";
    return v;
  }
  if (a && a !== "none") {
    if (a.includes("mp4a")) return "AAC";
    if (a.includes("opus")) return "Opus";
    if (a.includes("mp3")) return "MP3";
    if (a.includes("ec-3")) return "Dolby Digital";
    if (a.includes("vorbis")) return "Vorbis";
    if (a.includes("flac")) return "FLAC";
    return a;
  }
  return "";
}

function parseMbps(kbps?: number | null): string {
  if (!kbps) return "";
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;
}

/** Split all formats into well-defined groups. */
function useFormatGroups(info: MediaInfo | null) {
  return useMemo(() => {
    const groups = { "Video + audio": [] as MediaFormat[], "Video only": [] as MediaFormat[], "Audio only": [] as MediaFormat[] };
    for (const f of info?.formats ?? []) {
      const hasV = !!f.vcodec && f.vcodec !== "none";
      const hasA = !!f.acodec && f.acodec !== "none";
      if (hasV && hasA) groups["Video + audio"].push(f);
      else if (hasV) groups["Video only"].push(f);
      else if (hasA) groups["Audio only"].push(f);
    }
    const byQuality = (a: MediaFormat, b: MediaFormat) =>
      (b.height ?? b.abr ?? b.tbr ?? 0) - (a.height ?? a.abr ?? a.tbr ?? 0);
    const dedupe = (list: MediaFormat[], keyFn: (f: MediaFormat) => string) => {
      const seen = new Set<string>();
      const out: MediaFormat[] = [];
      for (const f of [...list].sort(byQuality)) {
        const k = keyFn(f);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(f);
        }
      }
      return out;
    };
    return {
      muxed: dedupe(groups["Video + audio"], (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${codecName(f.vcodec)}`),
      videoOnly: dedupe(groups["Video only"], (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${codecName(f.vcodec)}`),
      audio: dedupe(groups["Audio only"], (f) => `${f.abr ?? f.tbr ?? 0}|${f.ext}|${codecName(null, f.acodec)}`),
    };
  }, [info]);
}

function sortExts(exts: string[]): string[] {
  const pref = ["mp4", "webm", "mov", "mkv", "m4a", "mp3", "opus", "ogg", "wav"];
  return [...exts].sort(
    (a, b) => pref.indexOf(a) + 1 - (pref.indexOf(b) + 1) || a.localeCompare(b),
  );
}

/* --------------------------- active downloads --------------------------- */

type ActiveJob = Job & { label: string; delivered?: boolean };

/* -------------------- Animated Cyber-Track Modal (Concept 1) -------------------- */

function DownloadProgressModal({
  job,
  info,
  platform,
  onMinimize,
  onCancel,
}: {
  job: ActiveJob;
  info: MediaInfo | null;
  platform: Platform | null;
  onMinimize: () => void;
  onCancel: (id: string) => void;
}) {
  const percent = Math.min(100, Math.max(0, job.percent || 0));
  const brandColor = platform?.color || "#8b5cf6";
  const platformKey = platform?.key || "youtube";
  const active = job.status === "starting" || job.status === "downloading" || job.status === "converting";
  const done = job.status === "done";
  const isError = job.status === "error";

  // Escape key minimizes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMinimize();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onMinimize]);

  return (
    <div
      onClick={onMinimize}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg sm:max-w-xl overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-950/95 p-4 sm:p-7 shadow-2xl shadow-black ring-1 ring-white/10 backdrop-blur-2xl transition-all duration-300 animate-in zoom-in-95"
      >
        {/* Ambient neon radial glow matching platform brand */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-60 w-96 rounded-full blur-3xl opacity-35 transition-all duration-500"
          style={{ backgroundColor: brandColor }}
        />

        {/* Top bar: Platform Pill & Action Controls */}
        <div className="relative flex items-center justify-between gap-2">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] sm:text-xs font-black tracking-wider uppercase shadow-sm"
            style={{
              backgroundColor: `${brandColor}22`,
              color: brandColor,
              border: `1px solid ${brandColor}44`,
            }}
          >
            <PlatformIcon platformKey={platformKey} className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="truncate">{platform?.name || "Media"} Download</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onMinimize}
              title="Minimize to floating corner pill"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800/80 hover:text-white transition"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onCancel(job.id)}
              title={active ? "Cancel download" : "Close"}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800/80 hover:text-red-400 transition"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Media snippet preview */}
        <div className="relative mt-4 sm:mt-5 flex items-center gap-3 sm:gap-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-3 sm:p-3.5 backdrop-blur-sm">
          {info?.thumbnail ? (
            <img
              src={info.thumbnail}
              alt=""
              className="h-14 w-20 sm:h-16 sm:w-24 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-14 w-20 sm:h-16 sm:w-24 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500">
              <Film className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h4 className="line-clamp-1 text-xs sm:text-sm font-extrabold text-white">
              {info?.title || job.title || "Selected Media"}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="rounded-md bg-indigo-500/20 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-black tracking-wider text-indigo-300 ring-1 ring-indigo-500/30">
                {job.label}
              </span>
              {info?.channel && (
                <span className="flex items-center gap-1 text-[11px] sm:text-xs text-zinc-400 font-medium truncate max-w-[130px] sm:max-w-[180px]">
                  <span className="truncate">{info.channel}</span>
                  {info.channel_verified && <BadgeCheck className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* --- The Cyber-Rail (Hero Animated Track with Sliding Platform Logo) --- */}
        <div className="relative mt-5 sm:mt-7 mb-3 sm:mb-4">
          {/* Source and Destination track status labels */}
          <div className="mb-2 flex items-center justify-between text-[11px] sm:text-xs font-semibold text-zinc-400 gap-2">
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                className="h-2 w-2 shrink-0 rounded-full animate-ping"
                style={{ backgroundColor: brandColor }}
              />
              <span className="truncate">Source: {platform?.name || "Server"}</span>
            </span>
            <span className="flex items-center gap-1 shrink-0 text-zinc-400">
              {done ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Saved
                </span>
              ) : (
                <span className="text-zinc-500">To Downloads</span>
              )}
            </span>
          </div>

          {/* The Rail */}
          <div className="relative h-14 sm:h-16 w-full rounded-2xl bg-zinc-950/90 border border-zinc-800/90 p-1.5 shadow-inner flex items-center overflow-visible">
            {/* Background track rail line */}
            <div className="absolute inset-x-3 sm:inset-x-4 h-1.5 rounded-full bg-zinc-800/80" />

            {/* Glowing progress fill with shimmer */}
            <div
              className="absolute left-1.5 top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-out overflow-hidden"
              style={{
                width: `calc(${percent}% - 3px)`,
                background: `linear-gradient(90deg, #6366f1 0%, ${brandColor} 100%)`,
                boxShadow: `0 0 24px ${brandColor}66, 0 0 8px ${brandColor}aa`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shimmer" />
            </div>

            {/* THE SLIDING PLATFORM ICON CARRIER (glides from left to right as percent progresses!) */}
            <div
              className="absolute top-1/2 transition-all duration-300 ease-out z-20 pointer-events-none"
              style={{
                left: `clamp(24px, ${percent}%, calc(100% - 24px))`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-zinc-950 border-2 shadow-2xl transition-transform duration-200"
                style={{
                  borderColor: brandColor,
                  boxShadow: `0 0 26px ${brandColor}aa, inset 0 0 10px ${brandColor}33`,
                }}
              >
                <PlatformIcon platformKey={platformKey} className="h-5 w-5 sm:h-6 sm:w-6 transition-transform duration-300" />

                {active && (
                  <span
                    className="absolute -inset-1 rounded-2xl animate-ping opacity-35"
                    style={{ backgroundColor: brandColor }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Telemetry row: responsive flex that wraps gracefully on small screens */}
          <div className="mt-3.5 sm:mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tight">
                {Math.round(percent)}%
              </span>
              {job.speed && (
                <span className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold text-zinc-200 shadow-sm">
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  <span className="tabular-nums">{job.speed}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {job.eta && (
                <span className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium text-zinc-400 tabular-nums">
                  ETA {job.eta}
                </span>
              )}
              <span
                className={`rounded-lg px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider ${
                  done
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : job.status === "converting"
                      ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40"
                      : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                }`}
              >
                {done
                  ? "Done"
                  : job.status === "converting"
                    ? "FFmpeg Merge"
                    : job.status === "starting"
                      ? "Starting"
                      : "Downloading"}
              </span>
            </div>
          </div>
        </div>

        {/* Completion View */}
        {done && (
          <div className="mt-5 sm:mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 sm:p-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold text-emerald-200">Download Complete!</p>
                <p className="truncate text-[11px] sm:text-xs text-emerald-400/80">
                  {job.filename || "Your file is ready and saved to your device."}
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex gap-2">
              <button
                onClick={onMinimize}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:brightness-110 active:scale-95 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Active In-Progress Controls */}
        {active && (
          <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 border-t border-zinc-800/60">
            <button
              onClick={onMinimize}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition active:scale-95"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Minimize to background</span>
            </button>
            <button
              onClick={() => onCancel(job.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900/60 border border-red-900/40 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
              <span>Cancel download</span>
            </button>
          </div>
        )}

        {/* Error View */}
        {isError && (
          <div className="mt-5 sm:mt-6 rounded-2xl border border-red-900/60 bg-red-950/30 p-3.5 sm:p-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold text-red-200">Download Failed</p>
                <p className="text-[11px] sm:text-xs text-red-300/80 mt-0.5">{job.error || "An unexpected error occurred."}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={onMinimize}
                className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Floating Corner Progress Pill -------------------- */

function FloatingProgressPill({
  job,
  platform,
  onClick,
}: {
  job: ActiveJob;
  platform: Platform | null;
  onClick: () => void;
}) {
  const brandColor = platform?.color || "#8b5cf6";
  const done = job.status === "done";
  const percent = Math.min(100, Math.max(0, job.percent || 0));

  return (
    <div
      onClick={onClick}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 max-w-[calc(100vw-32px)] sm:max-w-xs flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-700/80 bg-zinc-950/95 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 transition-all hover:scale-105 hover:border-zinc-500 animate-in slide-in-from-bottom-5 duration-300"
      style={{ boxShadow: `0 8px 32px -8px ${brandColor}55` }}
    >
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border"
        style={{ borderColor: brandColor }}
      >
        <PlatformIcon platformKey={platform?.key || "youtube"} className="h-5 w-5" />
        {!done && (
          <span
            className="absolute -inset-0.5 rounded-xl animate-ping opacity-30"
            style={{ backgroundColor: brandColor }}
          />
        )}
      </div>

      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white truncate max-w-[140px]">{job.label}</span>
          <span className="text-xs font-black text-indigo-400 tabular-nums">{Math.round(percent)}%</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
          {done ? (
            <span className="text-emerald-400 font-bold">Ready</span>
          ) : (
            <>
              <span>{job.speed || "Downloading"}</span>
              {job.eta && <span>· ETA {job.eta}</span>}
            </>
          )}
        </div>
      </div>

      <div className="h-7 w-7 rounded-lg bg-zinc-800/80 flex items-center justify-center text-zinc-400 hover:text-white">
        <Maximize2 className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}

/* --------------------------- detected platform chip --------------------------- */

const SUB_LABELS: Record<string, string> = {
  youtube: "subscribers",
  reddit: "members",
  facebook: "followers",
  instagram: "followers",
  tiktok: "followers",
  threads: "followers",
  snapchat: "friends",
  bluesky: "followers",
  suno: "fans",
};

/** Channel avatar with graceful fallback to a gradient initial if the image fails. */
function ChannelAvatar({ src, name }: { src?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);

  const initial = name.trim().charAt(0) || "?";
  if (!src || broken) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-black text-white uppercase shadow">
        {initial}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/10 shadow"
      referrerPolicy="no-referrer"
    />
  );
}

function DetectedChip({ platform }: { platform: Platform }) {
  return (
    <div
      className="mx-auto mb-3 flex w-fit flex-wrap items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold"
      style={{
        backgroundColor: `${platform.color}1a`,
        borderColor: `${platform.color}55`,
        color: platform.color,
        boxShadow: `0 0 30px -10px ${platform.color}`,
      }}
    >
      <PlatformIcon platformKey={platform.key} className="h-4 w-4" />
      {platform.name}
      <span className="font-medium text-zinc-500">link detected</span>
    </div>
  );
}

/* ------------------------------ stat chip ------------------------------ */

function StatChip({ icon: Icon, tone, text }: { icon: React.ElementType; tone: string; text?: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-300">
      <Icon className="h-3.5 w-3.5" style={{ color: tone }} />
      {text}
    </span>
  );
}

/* ------------------------------ description ------------------------------ */

function DescriptionBox({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false);
  const short = html.length <= 160;
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
      <p
        className={`whitespace-pre-line text-sm leading-relaxed text-zinc-400 ${
          expanded ? "max-h-48 overflow-y-auto pr-2" : short ? "" : "line-clamp-2"
        }`}
      >
        {html}
      </p>
      {!short && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-bold text-indigo-400 transition hover:text-indigo-300"
        >
          {expanded ? "Show less ▲" : "Read more ▼"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ main ------------------------------ */

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [extFilter, setExtFilter] = useState<string>("all");
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const groups = useFormatGroups(info);

  // live platform auto-detection: from the typed URL first, else from the extractor
  const detectedPlatform: Platform | null = useMemo(
    () => detectPlatform(url.trim()) ?? platformFromExtractor(info?.extractor),
    [url, info],
  );

  // extension tabs (dynamic, from actual formats)
  const extTabs = useMemo(() => {
    const videoExts = sortExts(
      [...new Set([...groups.muxed, ...groups.videoOnly].map((f) => f.ext))].filter(Boolean),
    );
    const audioExts = sortExts([...new Set(groups.audio.map((f) => f.ext))].filter(Boolean));
    return tab === "video"
      ? ["all", ...videoExts]
      : ["all", ...(groups.audio.length ? ["mp3"] : []), ...audioExts];
  }, [tab, groups]);

  // reset ext filter when switching tabs or analyzing a new link
  useEffect(() => setExtFilter("all"), [tab]);
  useEffect(() => {
    if (phase === "ready") setExtFilter("all");
  }, [info, phase]);

  useEffect(() => {
    return () => {
      for (const j of jobsRef.current) {
        if (["starting", "downloading", "converting"].includes(j.status)) cancelJob(j.id);
      }
    };
  }, []);

  async function detect(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setPhase("error");
      setError("Please paste a full link starting with http:// or https://");
      return;
    }
    setPhase("loading");
    setError("");
    setInfo(null);
    try {
      const data = await fetchInfo(trimmed);
      setInfo(data);
      setPhase("ready");
      setTab("video");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function reset() {
    for (const j of jobsRef.current) {
      if (["starting", "downloading", "converting"].includes(j.status)) cancelJob(j.id);
    }
    setJobs([]);
    setUrl("");
    setInfo(null);
    setPhase("idle");
    setError("");
  }

  const beginJob = useCallback(async (options: { url: string; format?: string; mp3?: boolean }, label: string) => {
    const tempId = "job_" + Math.random().toString(36).slice(2, 9);
    try {
      let job: ActiveJob = {
        id: tempId,
        label,
        status: "starting",
        percent: 0,
        speed: "",
        eta: "",
        filename: null,
        title: null,
        error: null,
      };
      setJobs((prev) => [...prev, job]);
      setActiveJobId(tempId);
      setIsModalOpen(true);

      const id = await startDownload(options);
      job.id = id;
      setActiveJobId((curr) => (curr === tempId ? id : curr));
      setJobs((prev) => prev.map((j) => (j.id === tempId ? { ...j, id } : j)));

      for (;;) {
        await new Promise((r) => setTimeout(r, 1000));
        const state = await pollJob(id);
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...state } : j)));
        if (state.status === "done") {
          triggerSave(id);
          setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, delivered: true } : j)));
          break;
        }
        if (state.status === "error" || state.status === "expired") break;
      }
    } catch (err) {
      setJobs((prev) =>
        prev.map((j) =>
          j.label === label && (j.id === tempId || !j.id)
            ? { ...j, status: "error", error: err instanceof Error ? err.message : "Failed to start" }
            : j,
        ),
      );
    }
  }, []);

  const cancelOne = useCallback((id: string) => {
    void cancelJob(id);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "error", error: "Cancelled" } : j)),
    );
  }, []);

  function rowClick(e: React.MouseEvent, options: { url: string; format?: string }, label: string) {
    e.preventDefault();
    void beginJob(options, label);
  }

  const platformInfo = platformFromExtractor(info?.extractor) ?? detectedPlatform;
  const channelName = info?.channel || info?.uploader || "";

  // filtered lists honoring the ext tab
  const fMuxed = groups.muxed.filter((f) => extFilter === "all" || f.ext === extFilter);
  const fVideoOnly = groups.videoOnly.filter((f) => extFilter === "all" || f.ext === extFilter);
  const fAudio = groups.audio.filter((f) => extFilter === "all" || f.ext === extFilter);
  const showMp3Card = tab === "audio" && (extFilter === "all" || extFilter === "mp3") && groups.audio.length > 0;
  const currentModalJob = (activeJobId ? jobs.find((j) => j.id === activeJobId) : null) ?? jobs[jobs.length - 1] ?? null;

  return (
    <div id="downloader" className="mx-auto w-full max-w-5xl scroll-mt-24">
      <div className="mb-8">
        <LogoTicker activeKey={detectedPlatform?.key ?? null} />
      </div>

      {!info && detectedPlatform && !error && <DetectedChip platform={detectedPlatform} />}

      <form onSubmit={detect} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a video link (YouTube, TikTok, Instagram, X…)"
            className="h-14 w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 py-4 pr-4 pl-13 text-lg font-medium text-zinc-100 shadow-lg placeholder:font-normal placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={phase === "loading"}
          className="glow flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-8 text-lg font-extrabold tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {phase === "loading" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </>
          ) : (
            "Download"
          )}
        </button>
      </form>

      {phase === "error" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase === "ready" && info && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 shadow-2xl">
          {/* --- big thumbnail at top --- */}
          <div className="group relative overflow-hidden bg-zinc-950">
            {info.thumbnail ? (
              <img
                src={info.thumbnail}
                alt=""
                className="aspect-video max-h-[460px] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex aspect-video max-h-[360px] w-full items-center justify-center">
                <Film className="h-16 w-16 text-zinc-600" />
              </div>
            )}
            {/* hover play overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition duration-300 group-hover:bg-black/30">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/60 opacity-0 ring-1 ring-white/20 backdrop-blur transition duration-300 group-hover:opacity-100">
                <Play className="h-7 w-7 translate-x-0.5 fill-white text-white" />
              </span>
            </div>
            {info.duration != null && info.duration > 0 && (
              <span className="absolute right-3.5 bottom-3.5 rounded-lg bg-black/85 px-2.5 py-1 text-xs font-bold text-white shadow-md">
                {fmtDuration(info.duration)}
              </span>
            )}
          </div>

          {/* --- media info below thumbnail --- */}
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-extrabold leading-snug tracking-tight text-white lg:text-2xl">
                {info.title}
              </h3>
              <button
                onClick={reset}
                title="Clear"
                className="h-9 w-9 shrink-0 rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <Trash2 className="mx-auto h-4 w-4" />
              </button>
            </div>

            {/* channel row with avatar & clickable creator profile */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              {info.channel_url ? (
                <a
                  href={info.channel_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${channelName}'s profile`}
                  className="shrink-0 transition-transform hover:scale-105"
                >
                  <ChannelAvatar src={info.channel_avatar} name={channelName} />
                </a>
              ) : (
                <ChannelAvatar src={info.channel_avatar} name={channelName} />
              )}

              {info.channel_url ? (
                <a
                  href={info.channel_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${channelName}'s profile`}
                  className="group/channel inline-flex items-center gap-1.5 text-base font-bold text-zinc-100 hover:text-indigo-400 transition"
                >
                  <span className="group-hover/channel:underline underline-offset-4">{channelName}</span>
                  {info.channel_verified && <BadgeCheck className="h-4.5 w-4.5 text-sky-400 shrink-0" />}
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-500 group-hover/channel:text-indigo-400 transition shrink-0" />
                </a>
              ) : (
                <span className="flex items-center gap-1.5 text-base font-bold text-zinc-100">
                  {channelName}
                  {info.channel_verified && <BadgeCheck className="h-4.5 w-4.5 text-sky-400 shrink-0" />}
                </span>
              )}

              {/* Followers / Subscribers count */}
              {(() => {
                const followCount = (info.channel_followers ?? info.channel_subs) ?? 0;
                if (followCount <= 0) return null;
                const label = SUB_LABELS[platformInfo?.key ?? ""] ?? "subscribers";
                return (
                  <span className="rounded-lg bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                    {formatCount(followCount)} {label}
                  </span>
                );
              })()}

              {/* Following count or Following: Private */}
              {info.channel_following != null && (
                typeof info.channel_following === "number" && info.channel_following > 0 ? (
                  <span className="rounded-lg bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                    {formatCount(info.channel_following)} following
                  </span>
                ) : String(info.channel_following).toLowerCase() === "private" ? (
                  <span className="rounded-lg bg-zinc-800/80 px-2.5 py-1 text-xs font-medium text-zinc-400 italic">
                    Following: Private
                  </span>
                ) : null
              )}

              {platformInfo && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ backgroundColor: `${platformInfo.color}26`, color: platformInfo.color }}
                >
                  <PlatformIcon platformKey={platformInfo.key} className="h-3 w-3" />
                  {platformInfo.name}
                </span>
              )}
            </div>

            {/* stats chips with brand-tinted icons */}
            <div className="mt-4 flex flex-wrap gap-2">
              <StatChip icon={Eye} tone="#818cf8" text={info.view_count ? `${formatCount(info.view_count)} views` : ""} />
              <StatChip icon={ThumbsUp} tone="#e879f9" text={info.like_count ? `${formatCount(info.like_count)} likes` : ""} />
              <StatChip icon={CalendarDays} tone="#a5b4fc" text={formatDate(info.upload_date)} />
              <StatChip
                icon={Film}
                tone="#f0abfc"
                text={`${groups.muxed.length + groups.videoOnly.length} video · ${groups.audio.length} audio`}
              />
            </div>

            {info.description && <DescriptionBox html={info.description} />}
          </div>

          {/* --- main tabs --- */}
          <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3 bg-zinc-950/40">
            <div className="inline-flex rounded-xl bg-zinc-900/90 p-1 ring-1 ring-white/10 gap-1">
              <button
                onClick={() => setTab("video")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  tab === "video"
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Film className="h-3.5 w-3.5" /> Video ({groups.muxed.length + groups.videoOnly.length})
              </button>
              <button
                onClick={() => setTab("audio")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  tab === "audio"
                    ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md shadow-fuchsia-600/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Music className="h-3.5 w-3.5" /> Audio ({groups.audio.length + (showMp3Card ? 1 : 0)})
              </button>
            </div>
          </div>

          {/* --- extension filter tabs --- */}
          <div className="flex flex-wrap gap-2 border-t border-zinc-800/60 bg-zinc-950/30 px-5 py-3">
            {extTabs.map((ext) => {
              const active = extFilter === ext;
              const accent = tab === "video" ? "#6366f1" : "#d946ef";
              return (
                <button
                  key={ext}
                  onClick={() => setExtFilter(ext)}
                  style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
                  className={`rounded-xl border px-3.5 py-1 text-xs font-extrabold tracking-wider uppercase transition-all ${
                    active
                      ? "text-white shadow-lg shadow-indigo-500/20"
                      : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {ext === "all" ? "All Formats" : ext}
                </button>
              );
            })}
          </div>

          {/* Codecs legend — VP9/AV1 are platform-upgraded codecs, not errors */}
          <p className="border-t border-zinc-800/60 bg-zinc-950/40 px-5 py-2.5 text-[11px] leading-relaxed text-zinc-500">
            <span className="font-bold text-zinc-400">H.264/AAC</span> = max compatibility ·{" "}
            <span className="font-bold text-zinc-400">VP9/AV1/Opus</span> = newer codecs, same quality in smaller files,
            play in every modern player. Sound is always merged in automatically.
          </p>

          {/* --- formats --- */}
          <div className="border-t border-zinc-800 bg-zinc-950/20">
            {tab === "video" && (
              <>
                {fMuxed.length > 0 && (
                  <FormatSection
                    heading="Ready to play (video + audio in one file)"
                    items={fMuxed}
                    labelOf={(f) => (f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}` : f.format_id)}
                    subOf={(f) => [codecName(f.vcodec), parseMbps(f.tbr)].filter(Boolean).join(" · ")}
                    url={url.trim()}
                    onClick={rowClick}
                  />
                )}
                {fMuxed.length === 0 && fVideoOnly.length === 0 && extFilter === "all" && (
                  <p className="px-5 py-4 text-sm text-zinc-500">
                    No video formats available for this link — try the Audio tab.
                  </p>
                )}
                {fMuxed.length === 0 && extFilter === "all" && fVideoOnly.length > 0 && (
                  <p className="bg-zinc-950/60 px-5 py-3 text-xs text-zinc-500">
                    This video streams "video + audio" separately. Pick a quality — we'll merge it
                    with the best audio track automatically.
                  </p>
                )}
                {fVideoOnly.length > 0 && (
                  <FormatSection
                    heading="Available qualities (video + audio merged)"
                    items={fVideoOnly}
                    labelOf={(f) => (f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}` : f.format_id)}
                    subOf={(f) => [codecName(f.vcodec), parseMbps(f.tbr)].filter(Boolean).join(" · ")}
                    url={url.trim()}
                    onClick={rowClick}
                  />
                )}
              </>
            )}

            {tab === "audio" && (
              <>
                {showMp3Card && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      void beginJob({ url: url.trim(), format: "ba/b", mp3: true }, "MP3 · best quality");
                    }}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-fuchsia-950/30 via-zinc-900/40 to-indigo-950/30 p-4 transition-all hover:bg-fuchsia-950/50 border-b border-zinc-800/60 w-full text-left"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-pink-600 text-xs font-black tracking-wider uppercase text-white shadow-lg shadow-fuchsia-600/30">
                        MP3
                      </span>
                      <div className="min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-white">
                            MP3 Audio — Best Quality
                          </span>
                          <span className="rounded-md bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-fuchsia-300 ring-1 ring-fuchsia-500/30">
                            320 KBPS
                          </span>
                        </div>
                        <span className="block text-xs text-zinc-400 mt-0.5">
                          Universal audio format converted server-side with FFmpeg
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-600/30 transition-all duration-200 group-hover:from-fuchsia-500 group-hover:to-indigo-500 group-hover:scale-[1.03] active:scale-95 shrink-0">
                      <Download className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5" />
                      <span>Download MP3</span>
                    </span>
                  </button>
                )}
                {fAudio.length > 0 && (
                  <FormatSection
                    heading="Original audio formats"
                    items={fAudio}
                    labelOf={(f) => (f.abr ? `${Math.round(f.abr)} kbps` : "Best available quality")}
                    subOf={(f) => [codecName(null, f.acodec), parseMbps(f.tbr), f.ext].filter(Boolean).join(" · ")}
                    url={url.trim()}
                    onClick={rowClick}
                  />
                )}
              </>
            )}
          </div>

          {/* Bottom helper tip */}
          <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/60 px-5 py-3 text-xs text-zinc-500">
            <span>Pick any quality above to download with live progress.</span>
            {currentModalJob && !isModalOpen && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition flex items-center gap-1.5"
              >
                <Zap className="h-3 w-3 text-amber-400 fill-amber-400" />
                <span>View download ({Math.round(currentModalJob.percent)}%)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- Download Progress Modal (Concept 1: Cyber-Track Slider) --- */}
      {isModalOpen && currentModalJob && (
        <DownloadProgressModal
          job={currentModalJob}
          info={info}
          platform={platformInfo}
          onMinimize={() => setIsModalOpen(false)}
          onCancel={cancelOne}
        />
      )}

      {/* --- Floating corner pill when minimized and active --- */}
      {!isModalOpen && currentModalJob && (
        <FloatingProgressPill
          job={currentModalJob}
          platform={platformInfo}
          onClick={() => setIsModalOpen(true)}
        />
      )}
    </div>
  );
}

/* -------------------------- format section -------------------------- */

function FormatSection({
  heading,
  items,
  labelOf,
  subOf,
  url,
  onClick,
}: {
  heading: string;
  items: MediaFormat[];
  labelOf: (f: MediaFormat) => string;
  subOf?: (f: MediaFormat) => string;
  url: string;
  onClick: (e: React.MouseEvent, opts: { url: string; format?: string }, label: string) => void;
}) {
  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between bg-zinc-950/70 px-5 py-2.5 border-b border-zinc-800/40">
        <span className="text-[11px] font-black tracking-widest text-zinc-400 uppercase">
          {heading}
        </span>
        <span className="text-[11px] font-bold text-zinc-500">
          {items.length} options
        </span>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {items.map((f) => {
          const label = labelOf(f);
          const sub = subOf?.(f) || "";
          const fpsExtra = f.fps && f.fps > 30 ? ` · ${f.fps}fps` : "";
          const isHighRes = f.height && f.height >= 1080;
          return (
            <a
              key={f.format_id}
              href={`/api/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent((f.acodec && f.acodec !== "none") ? f.format_id : `${f.format_id}+ba/b`)}`}
              onClick={(e) => onClick(e, { url, format: (f.acodec && f.acodec !== "none") ? f.format_id : `${f.format_id}+ba/b` }, label)}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-zinc-900/20 px-5 py-3 text-left transition-all duration-200 hover:bg-zinc-800/60"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-xl text-xs font-black tracking-wider uppercase shadow-inner ${
                    f.ext === "mp4"
                      ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30"
                      : f.ext === "webm"
                        ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                        : f.ext === "mp3"
                          ? "bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-500/30"
                          : "bg-zinc-800 text-zinc-300 ring-1 ring-white/5"
                  }`}
                >
                  {f.ext}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-extrabold text-zinc-100 tracking-tight group-hover:text-white transition">
                      {label}
                    </span>
                    {isHighRes && (
                      <span className="rounded-md bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-emerald-400 ring-1 ring-emerald-500/30">
                        {(f.height ?? 0) >= 2160 ? "4K ULTRA" : (f.height ?? 0) >= 1440 ? "2K QHD" : "1080p FHD"}
                      </span>
                    )}
                    {f.fps && f.fps > 30 && (
                      <span className="rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                        {f.fps}fps
                      </span>
                    )}
                  </div>
                  {sub && (
                    <span className="block truncate text-xs text-zinc-400 mt-0.5">
                      {sub}
                      {fpsExtra}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t border-zinc-800/40 sm:border-t-0">
                <span className="rounded-lg bg-zinc-800/80 px-2.5 py-1 text-xs font-semibold text-zinc-400 tabular-nums">
                  {fmtSize(f.filesize, f.filesize_approx) || "Size N/A"}
                </span>

                <span className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 group-hover:from-indigo-500 group-hover:to-fuchsia-500 group-hover:shadow-indigo-500/40 group-hover:scale-[1.03] active:scale-95">
                  <Download className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <span>Download</span>
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
