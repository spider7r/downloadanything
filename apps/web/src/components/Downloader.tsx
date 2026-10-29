import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  Link2,
  Loader2,
  Music,
  Trash2,
  X,
} from "lucide-react";
import {
  cancelJob,
  fileUrl,
  fetchInfo,
  pollJob,
  startDownload,
  triggerSave,
  type Job,
  type MediaFormat,
  type MediaInfo,
} from "../api";

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
  const done = job.status === "done" && !job.delivered;
  const expired = job.status === "expired" || (job.status === "done" && job.delivered);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <div className="flex items-center gap-3">
        {active && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />}
        {job.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />}
        {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />}
        {expired && <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-600" />}

        <span className={`min-w-0 flex-1 truncate text-sm ${expired ? "text-zinc-600" : "text-zinc-200"}`}>
          {job.label}
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
          <span className="w-7" />
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
            {active && <span className="text-zinc-500">{Math.round(job.percent)}%</span>}
          </div>
        </>
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
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const groups = useFormatGroups(info);

  useEffect(() => {
    return () => {
      // cancel everything on unmount
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

      // poll until finished, then deliver the file
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

  function rowClick(e: React.MouseEvent, options: { url: string; format?: string; mp3?: boolean }, label: string) {
    e.preventDefault();
    void beginJob(options, label);
  }

  const hasAudio = groups.audio.length > 0;

  return (
    <div id="downloader" className="mx-auto w-full max-w-2xl">
      <form onSubmit={detect} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a video link (YouTube, TikTok, Instagram, X…)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-3.5 pr-4 pl-12 text-lg text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={phase === "loading"}
          className="glow flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 py-3.5 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
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
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-2xl">
          {/* --- media header --- */}
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            {info.thumbnail && (
              <img
                src={info.thumbnail}
                alt=""
                className="h-28 w-44 shrink-0 rounded-lg object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-lg font-semibold text-white">{info.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {info.uploader}
                {info.uploader && " · "}
                {info.duration ? fmtDuration(info.duration) : ""}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">
                {groups.muxed.length + groups.videoOnly.length + groups.audio.length} formats available
              </p>
            </div>
            <button
              onClick={reset}
              title="Clear"
              className="h-9 w-9 shrink-0 self-start rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <Trash2 className="mx-auto h-4 w-4" />
            </button>
          </div>

          {/* --- tabs --- */}
          <div className="flex gap-2 border-t border-zinc-800 px-4 pt-3">
            <button
              onClick={() => setTab("video")}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium ${
                tab === "video"
                  ? "border-b-2 border-indigo-400 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Film className="h-4 w-4" /> Video
            </button>
            <button
              onClick={() => setTab("audio")}
              className={`flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium ${
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
              <p className="px-4 py-3 text-sm text-zinc-500">
                This video streams in "video + audio" separately. Pick a "Video only" quality — we'll
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
                  className="flex w-full items-center gap-3 bg-gradient-to-r from-fuchsia-950/40 to-indigo-950/40 px-4 py-3 text-left transition hover:brightness-125"
                >
                  <span className="flex h-8 w-14 items-center justify-center rounded-md bg-fuchsia-600/80 text-xs font-bold text-white">
                    mp3
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                    MP3 — best quality (converted with FFmpeg)
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-fuchsia-400" />
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
            <div className="space-y-2 border-t border-zinc-800 bg-zinc-950/40 p-3">
              {jobs.map((j, i) => (
                <JobRow key={j.id || i} job={j} onCancel={cancelOne} />
              ))}
            </div>
          )}

          {jobs.length === 0 && (
            <p className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-500">
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
      <p className="sticky top-0 z-10 bg-zinc-900/95 px-4 py-1.5 text-[11px] font-semibold tracking-widest text-zinc-500 uppercase backdrop-blur">
        {heading}
      </p>
      {items.map((f, i) => {
        const isBest = i === 0;
        return (
          <a
            key={f.format_id}
            href={`/api/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(f.format_id)}`}
            onClick={(e) => onClick(e, { url, format: f.format_id }, labelOf(f))}
            className="group flex items-center gap-3 bg-zinc-900/30 px-4 py-2.5 transition hover:bg-zinc-800/70"
          >
            <span
              className={`flex h-8 w-14 items-center justify-center rounded-md text-xs font-bold tracking-wide uppercase ${
                isBest ? "bg-indigo-500/30 text-indigo-300" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {f.ext}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
              {labelOf(f)}
              {isBest && <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">BEST</span>}
            </span>
            <span className="text-xs text-zinc-500">{fmtSize(f.filesize, f.filesize_approx)}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-600 transition group-hover:bg-indigo-500 group-hover:text-white">
              <Download className="h-4 w-4" />
            </span>
          </a>
        );
      })}
    </div>
  );
}
