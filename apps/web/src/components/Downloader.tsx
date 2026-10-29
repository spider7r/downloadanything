import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  Film,
  Link2,
  Loader2,
  Music,
  Trash2,
} from "lucide-react";
import { downloadUrl, fetchInfo, type MediaFormat, type MediaInfo } from "../api";

type Phase = "idle" | "loading" | "ready" | "error";

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

/**
 * Split all formats into "Video" and "Audio only" lists.
 * - Video list: every entry with a video codec (progressive shows a ✓, adaptive notes "video + audio merged")
 * - Both lists keep ALL options (stable-sorted, deduped).
 */
function useFormatLists(info: MediaInfo | null) {
  return useMemo(() => {
    const progressive: MediaFormat[] = []; // has video AND audio (single file, no merge)
    const adaptive: MediaFormat[] = []; // video without audio (needs ffmpeg merge)
    const audio: MediaFormat[] = [];

    for (const f of info?.formats ?? []) {
      const hasV = !!f.vcodec && f.vcodec !== "none";
      const hasA = !!f.acodec && f.acodec !== "none";
      if (hasV && hasA) progressive.push(f);
      else if (hasV) adaptive.push(f);
      else if (hasA) audio.push(f);
    }

    const byQuality = (a: MediaFormat, b: MediaFormat) =>
      (b.height ?? b.abr ?? b.tbr ?? 0) - (a.height ?? a.abr ?? a.tbr ?? 0);

    const dedupe = (list: MediaFormat[], keyFn: (f: MediaFormat) => string) => {
      const seen = new Set<string>();
      const out: MediaFormat[] = [];
      for (const f of [...list].sort(byQuality)) {
        const key = keyFn(f);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
      }
      return out;
    };

    return {
      progressive: dedupe(progressive, (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${f.vcodec}`),
      adaptive: dedupe(adaptive, (f) => `${f.height ?? 0}|${f.fps ?? 0}|${f.ext}|${f.vcodec}`),
      audio: dedupe(audio, (f) => `${f.abr ?? f.tbr ?? 0}|${f.ext}|${f.acodec}`),
    };
  }, [info]);
}

const AUDIO_ORDER = ["mp3", "m4a", "opus", "webm", "ogg", "wav"];

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [downloadingLabel, setDownloadingLabel] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const lists = useFormatLists(info);

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
    setUrl("");
    setInfo(null);
    setPhase("idle");
    setError("");
    setDownloading(false);
    setDownloadingLabel(null);
  }

  function startDownload(e: React.MouseEvent<HTMLAnchorElement>, label: string) {
    setDownloading(true);
    setDownloadingLabel(label);
    // clear the state a bit later (download continues independently in the browser)
    setTimeout(() => setDownloading(false), 8000);
  }

  const hasMp3 = useMemo(
    () => lists.audio.some((a) => a.ext === "m4a" || a.ext === "mp3" || a.ext === "opus" || a.ext === "webm"),
    [lists.audio],
  );

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
              <p className="mt-0.5 text-xs text-zinc-600">{lists.progressive.length + lists.adaptive.length + lists.audio.length} formats available</p>
            </div>
            <button
              onClick={reset}
              title="Clear"
              className="h-9 w-9 shrink-0 self-start rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            >
              <Trash2 className="mx-auto h-4 w-4" />
            </button>
          </div>

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

          <div className="max-h-96 divide-y divide-zinc-800/60 overflow-y-auto border-t border-zinc-800">
            {tab === "video" &&
              [...lists.progressive, ...lists.adaptive].map((f) => {
                const isProgressive = lists.progressive.includes(f);
                const isHd = (f.height ?? 0) >= 1080;
                return (
                  <a
                    key={`${tab}-${f.format_id}`}
                    href={downloadUrl({ url: url.trim(), format: f.format_id })}
                    onClick={(e) => startDownload(e, `${f.height}p ${f.ext}`)}
                    className="mt-px flex items-center gap-3 bg-zinc-900/40 px-4 py-3 transition hover:bg-zinc-800/70"
                  >
                    <span className="flex h-8 w-14 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold tracking-wide text-zinc-300 uppercase">
                      {f.ext}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                      {f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}${isHd ? " · HD" : ""}` : f.format_note || f.format_id}
                      {!isProgressive && <span className="ml-2 text-xs text-zinc-500">(merged video+audio)</span>}
                    </span>
                    <span className="text-xs text-zinc-500">{fmtSize(f.filesize, f.filesize_approx)}</span>
                    <Download className="h-4 w-4 shrink-0 text-indigo-400" />
                  </a>
                );
              })}

            {tab === "audio" && hasMp3 && (
              <a
                key="mp3-best"
                href={downloadUrl({ url: url.trim(), format: "ba/b", mp3: true })}
                onClick={(e) => startDownload(e, "best MP3")}
                className="flex items-center gap-3 bg-gradient-to-r from-fuchsia-950/40 to-indigo-950/40 px-4 py-3 transition hover:brightness-125"
              >
                <span className="flex h-8 w-14 items-center justify-center rounded-md bg-fuchsia-600/80 text-xs font-bold text-white">
                  mp3
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  MP3 — best quality (converted)
                </span>
                <Download className="h-4 w-4 shrink-0 text-fuchsia-400" />
              </a>
            )}

            {tab === "audio" &&
              [...lists.audio].sort((a, b) => {
                const rank = (f: MediaFormat) => AUDIO_ORDER.indexOf(f.ext) + 1 || 99;
                return rank(a) - rank(b) || (b.abr ?? 0) - (a.abr ?? 0);
              }).map((f) => (
                <a
                  key={f.format_id}
                  href={downloadUrl({ url: url.trim(), format: f.format_id })}
                  onClick={(e) => startDownload(e, `${Math.round(f.abr ?? 0)} kbps ${f.ext}`)}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/70"
                >
                  <span className="flex h-8 w-14 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold tracking-wide text-zinc-300 uppercase">
                    {f.ext}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                    {f.abr ? `${Math.round(f.abr)} kbps` : f.format_note || "Best available quality"}
                    {(f.abr ?? 0) >= 128 && <span className="ml-2 text-xs text-green-500">HD</span>}
                  </span>
                  <span className="text-xs text-zinc-500">{fmtSize(f.filesize, f.filesize_approx)}</span>
                  <Download className="h-4 w-4 shrink-0 text-fuchsia-400" />
                </a>
              ))}
          </div>

          <p className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-500">
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-400" />
                <span>
                  Preparing <span className="text-zinc-300">{downloadingLabel}</span> — the file will
                  appear in your browser downloads shortly. Large HLS videos can take a minute.
                </span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                Streamed directly to you — we don't store files.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
