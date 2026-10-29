import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Download,
  Eye,
  Film,
  Link2,
  Loader2,
  Music,
  ThumbsUp,
  Trash2,
  X,
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
  PLATFORMS,
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
      muxed: dedupe(groups["Video + audio"], (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${f.vcodec}`),
      videoOnly: dedupe(groups["Video only"], (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${f.vcodec}`),
      audio: dedupe(groups["Audio only"], (f) => `${f.abr ?? f.tbr ?? 0}|${f.ext}|${f.acodec}`),
    };
  }, [info]);
}

/* --------------------------- active downloads --------------------------- */

type ActiveJob = Job & { label: string; delivered?: boolean };

function JobRow({ job, onCancel }: { job: ActiveJob; onCancel: (id: string) => void }) {
  const active = job.status === "starting" || job.status === "downloading" || job.status === "converting";
  const delivered = job.status === "expired" || (job.status === "done" && job.delivered);
  const done = job.status === "done" && !job.delivered;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <div className="flex items-center gap-3">
        {active && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />}
        {job.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
        {done && <CheckCircleGreen />}
        {delivered && <CheckCircleMuted />}

        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${delivered ? "text-zinc-500" : "text-zinc-100"}`}>
          {job.status === "done" && job.filename ? job.filename : job.label}
        </span>

        {active && job.speed && <span className="shrink-0 text-xs text-zinc-500">{job.speed}</span>}
        {active && job.eta && <span className="shrink-0 text-xs text-zinc-500">ETA {job.eta}</span>}

        {active ? (
          <button
            onClick={() => onCancel(job.id)}
            title="Cancel download"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
      </div>

      {(active || job.status === "error") && (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            {job.status === "error" ? (
              <div className="h-full w-full bg-red-900/60" />
            ) : (
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500"
                style={{ width: `${job.percent}%` }}
              />
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className={job.status === "error" ? "text-red-400" : "text-zinc-500"}>
              {job.status === "error"
                ? job.error || "Download failed"
                : job.status === "converting"
                  ? "Merging / converting with FFmpeg…"
                  : job.status === "starting"
                    ? "Connecting…"
                    : `${Math.round(job.percent)}%`}
            </span>
            {active && <span className="font-semibold text-zinc-400">{Math.round(job.percent)}%</span>}
          </div>
        </>
      )}
    </div>
  );
}

const CheckCircleGreen = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-green-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" opacity="0.4" />
    <path d="m8.5 12.5 2.5 2.5 5-5.5" />
  </svg>
);
const CheckCircleMuted = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-zinc-700" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" opacity="0.4" />
    <path d="m8.5 12.5 2.5 2.5 5-5.5" />
  </svg>
);

/* --------------------------- detected platform chip --------------------------- */

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

/* ------------------------------ media info card ------------------------------ */

function StatChip({ icon: Icon, text }: { icon: React.ElementType; text?: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-zinc-300">
      <Icon className="h-3.5 w-3.5 text-zinc-500" />
      {text}
    </span>
  );
}

function DescriptionBox({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false);
  const short = html.length <= 180;
  return (
    <div className="mt-3">
      <div
        className={`whitespace-pre-line text-sm leading-relaxed text-zinc-400 ${
          expanded ? "max-h-44 overflow-y-auto pr-2" : short ? "" : "line-clamp-2"
        }`}
      >
        {html}
      </div>
      {!short && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          {expanded ? "Show less ▲" : "Read more ▼"}
        </button>
      )}
    </div>
  );
}

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const groups = useFormatGroups(info);

  // live platform auto-detection: from the typed URL first, else from the extractor
  const detectedPlatform: Platform | null = useMemo(
    () => detectPlatform(url.trim()) ?? platformFromExtractor(info?.extractor),
    [url, info],
  );

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
    try {
      let job: ActiveJob = {
        id: "",
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

      const id = await startDownload(options);
      job.id = id;
      setJobs((prev) => prev.map((j) => (j === job ? { ...j, id } : j)));

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
        prev.map((j) => (j.label === label && !j.id ? { ...j, status: "error", error: err instanceof Error ? err.message : "Failed to start" } : j)),
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

  const hasAudio = groups.audio.length > 0;
  const platformInfo = platformFromExtractor(info?.extractor) ?? detectedPlatform;

  return (
    <div id="downloader" className="mx-auto w-full max-w-5xl scroll-mt-24">
      <LogoTicker activeKey={detectedPlatform?.key ?? null} />

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
          {/* --- rich media header --- */}
          <div className="grid gap-5 p-5 sm:grid-cols-[280px,1fr] lg:grid-cols-[320px,1fr]">
            <div className="relative overflow-hidden rounded-xl bg-zinc-800 shadow-lg">
              {info.thumbnail ? (
                <img
                  src={info.thumbnail}
                  alt=""
                  className="aspect-video w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center">
                  <Film className="h-10 w-10 text-zinc-600" />
                </div>
              )}
              {info.duration != null && info.duration > 0 && (
                <span className="absolute right-2 bottom-2 rounded-md bg-black/85 px-2 py-0.5 text-xs font-bold text-white">
                  {fmtDuration(info.duration)}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-extrabold leading-snug tracking-tight text-white line-clamp-2 lg:text-2xl">
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

              {/* channel row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-bold text-zinc-100">{info.channel || info.uploader}</span>
                {info.channel_subs != null && info.channel_subs > 0 && (
                  <span className="text-sm text-zinc-500">
                    · {formatCount(info.channel_subs)} subscribers
                  </span>
                )}
                {platformInfo && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ backgroundColor: `${platformInfo.color}26`, color: platformInfo.color }}
                  >
                    <PlatformIcon platformKey={platformInfo.key} className="h-3 w-3" />
                    {platformInfo.name}
                  </span>
                )}
              </div>

              {/* stats chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                <StatChip icon={Eye} text={info.view_count ? `${formatCount(info.view_count)} views` : ""} />
                <StatChip icon={ThumbsUp} text={info.like_count ? `${formatCount(info.like_count)} likes` : ""} />
                <StatChip icon={CalendarDays} text={formatDate(info.upload_date)} />
                <StatChip
                  icon={Film}
                  text={`${groups.muxed.length + groups.videoOnly.length} video · ${groups.audio.length} audio`}
                />
              </div>

              {info.description && <DescriptionBox html={info.description} />}
            </div>
          </div>

          {/* --- tabs --- */}
          <div className="flex gap-2 border-t border-zinc-800 px-5 pt-3">
            <button
              onClick={() => setTab("video")}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                tab === "video"
                  ? "border-b-2 border-indigo-400 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Film className="h-4 w-4" /> Video
            </button>
            <button
              onClick={() => setTab("audio")}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-bold ${
                tab === "audio"
                  ? "border-b-2 border-fuchsia-400 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Music className="h-4 w-4" /> Audio
            </button>
          </div>

          {/* --- formats --- */}
          <div className="max-h-96 divide-y divide-zinc-800/60 overflow-y-auto border-t border-zinc-800">
            {tab === "video" && groups.muxed.length > 0 && (
              <FormatSection
                heading="Ready to play (video + audio in one file)"
                items={groups.muxed}
                labelOf={(f) => (f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""} ${f.ext}` : f.format_id)}
                url={url.trim()}
                onClick={rowClick}
              />
            )}
            {tab === "video" && groups.muxed.length === 0 && (
              <p className="px-5 py-3 text-sm text-zinc-500">
                This video streams "video + audio" separately. Pick a quality below — we'll
                merge it with the best audio track automatically.
              </p>
            )}
            {tab === "video" && groups.videoOnly.length > 0 && (
              <FormatSection
                heading="Higher qualities (merged automatically)"
                items={groups.videoOnly}
                labelOf={(f) => (f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""} ${f.ext}` : f.format_id)}
                url={url.trim()}
                onClick={rowClick}
              />
            )}

            {tab === "audio" && (
              <>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    void beginJob({ url: url.trim(), format: "ba/b", mp3: true }, "MP3 · best quality");
                  }}
                  className="flex w-full items-center gap-3 bg-gradient-to-r from-fuchsia-950/40 to-indigo-950/40 px-5 py-3 text-left transition hover:brightness-125"
                >
                  <span className="flex h-9 w-16 items-center justify-center rounded-md bg-fuchsia-600/90 text-sm font-bold text-white">
                    mp3
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-bold text-white">
                    MP3 — best quality (converted with FFmpeg)
                  </span>
                  <Download className="h-5 w-5 shrink-0 text-fuchsia-400" />
                </button>
                {hasAudio && (
                  <FormatSection
                    heading="Original audio formats"
                    items={groups.audio}
                    labelOf={(f) => (f.abr ? `${Math.round(f.abr)} kbps ${f.ext}` : `${f.ext}`)}
                    url={url.trim()}
                    onClick={rowClick}
                  />
                )}
              </>
            )}
          </div>

          {/* --- active jobs / deliveries --- */}
          {jobs.length > 0 && (
            <div className="space-y-2 border-t border-zinc-800 bg-zinc-950/40 p-4">
              {jobs.map((j, i) => (
                <JobRow key={j.id || i} job={j} onCancel={cancelOne} />
              ))}
            </div>
          )}

          {jobs.length === 0 && (
            <p className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-5 py-3 text-xs text-zinc-500">
              <span>Pick a quality above — you'll see live progress, then your browser will save the file.</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------- format section -------------------------- */

function FormatSection({
  heading,
  items,
  labelOf,
  url,
  onClick,
}: {
  heading: string;
  items: MediaFormat[];
  labelOf: (f: MediaFormat) => string;
  url: string;
  onClick: (e: React.MouseEvent, opts: { url: string; format?: string }, label: string) => void;
}) {
  return (
    <div>
      <p className="sticky top-0 z-10 bg-zinc-900/95 px-5 py-2 text-[11px] font-bold tracking-widest text-zinc-500 uppercase backdrop-blur">
        {heading}
      </p>
      {items.map((f, i) => {
        const isBest = i === 0;
        return (
          <a
            key={f.format_id}
            href={`/api/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(f.format_id)}`}
            onClick={(e) => onClick(e, { url, format: f.format_id }, labelOf(f))}
            className="group flex items-center gap-4 bg-zinc-900/30 px-5 py-3 transition hover:bg-zinc-800/70"
          >
            <span
              className={`flex h-9 w-16 items-center justify-center rounded-lg text-sm font-extrabold tracking-wide uppercase ${
                isBest ? "bg-indigo-500/30 text-indigo-300" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {f.ext}
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-100">
              {labelOf(f)}
              {isBest && <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-indigo-300">BEST</span>}
            </span>
            <span className="text-sm text-zinc-500">{fmtSize(f.filesize, f.filesize_approx)}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-600 transition group-hover:bg-indigo-500 group-hover:text-white">
              <Download className="h-4.5 w-4.5" />
            </span>
          </a>
        );
      })}
    </div>
  );
}
