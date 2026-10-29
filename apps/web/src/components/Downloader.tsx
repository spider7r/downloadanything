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

function fmtSize(bytes?: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Classify formats into "Video" (incl. muxed/progressive) and "Audio only" lists. */
function useFormatLists(info: MediaInfo | null) {
  return useMemo(() => {
    const video: MediaFormat[] = [];
    const audio: MediaFormat[] = [];
    for (const f of info?.formats ?? []) {
      const hasV = f.vcodec && f.vcodec !== "none";
      const hasA = f.acodec && f.acodec !== "none";
      if (hasV) video.push(f);
      else if (hasA) audio.push(f);
    }
    // Highest quality first, dedupe by (resolution, ext)
    video.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0));
    audio.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0));
    const seen = new Set<string>();
    const dedupe = (list: MediaFormat[]) =>
      list.filter((f) => {
        const key = `${f.height ?? f.abr ?? f.tbr ?? 0}-${f.ext}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return {
      video: dedupe(video).slice(0, 8),
      audio: dedupe(audio.filter((a) => ["mp3", "m4a", "opus", "webm", "ogg"].includes(a.ext) || a.ext === "m4a")).slice(0, 5) || dedupe(audio).slice(0, 5),
    };
  }, [info]);
}

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"video" | "audio">("video");

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
  }

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
                className="h-28 w-50 shrink-0 rounded-lg object-cover sm:w-44"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-white">{info.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {info.uploader}
                {info.uploader && " · "}
                {info.duration ? fmtDuration(info.duration) : ""}
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

          <div className="divide-y divide-zinc-800/60 border-t border-zinc-800">
            {(tab === "video" ? lists.video : lists.audio).map((f) => {
              const isHd = (f.height ?? 0) >= 1080 || (tab === "audio" && (f.abr ?? 0) >= 128);
              return (
                <a
                  key={f.format_id}
                  href={downloadUrl({ url: url.trim(), format: f.format_id })}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/50"
                >
                  <span className="flex h-8 w-14 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold tracking-wide text-zinc-300 uppercase">
                    {f.ext}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                    {tab === "video"
                      ? f.height
                        ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ""}${isHd ? " HD" : ""}`
                        : f.format_note || f.format_id
                      : f.abr
                        ? `${Math.round(f.abr)} kbps`
                        : f.format_note || "Quality"}
                    {tab === "audio" ? "" : f.filesize || f.filesize_approx ? "" : ""}
                  </span>
                  <span className="text-xs text-zinc-500">{fmtSize(f.filesize ?? f.filesize_approx)}</span>
                  <Download className="h-4 w-4 shrink-0 text-indigo-400" />
                </a>
              );
            })}
          </div>

          <p className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-500">
            <Check className="h-3.5 w-3.5 text-green-500" />
            Your download will start in the browser. Streamed directly — we don't store files.
          </p>
        </div>
      )}
    </div>
  );
}
