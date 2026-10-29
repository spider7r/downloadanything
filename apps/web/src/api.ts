// Minimal typed API layer for the Download Anything backend.

export type MediaFormat = {
  format_id: string;
  ext: string;
  height?: number;
  fps?: number;
  vcodec: string | null;
  acodec: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
  format_note?: string;
};

export type MediaInfo = {
  title: string;
  uploader?: string;
  duration?: number | null;
  thumbnail?: string;
  webpage_url?: string;
  extractor?: string;
  formats: MediaFormat[];
};

export type DownloadOptions = {
  url: string;
  format?: string;
  /** request MP3 conversion (needs ffmpeg on the server) */
  mp3?: boolean;
};

export async function fetchInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  let res: Response;
  try {
    res = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch {
    throw new Error("Can't reach the download server. Is the API running? (pnpm dev:server)");
  }

  // Read as text first so a proxy/HTML error page never produces "Unexpected token '<'"
  const text = await res.text();
  let data: (MediaInfo & { error?: string }) | null = null;
  try {
    data = JSON.parse(text) as MediaInfo & { error?: string };
  } catch {
    // Not JSON — server likely offline / proxy failed
    if (!res.ok) {
      throw new Error(
        res.status === 502 || res.status === 500
          ? "The download server is offline or restarting. Please try again in a moment."
          : `Unexpected server response (HTTP ${res.status}).`,
      );
    }
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  if (!res.ok) throw new Error(data?.error || `Could not fetch this link (HTTP ${res.status})`);
  if (!data) throw new Error("Empty response from server");
  return data;
}

export function downloadUrl({ url, format, mp3 }: DownloadOptions): string {
  const params = new URLSearchParams({ url });
  if (format) params.set("format", format);
  if (mp3) params.set("mp3", "1");
  return `/api/download?${params.toString()}`;
}
