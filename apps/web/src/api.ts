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
};

export async function fetchInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const res = await fetch("/api/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  const data = (await res.json()) as MediaInfo & { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not fetch this link");
  return data;
}

export function downloadUrl({ url, format }: DownloadOptions): string {
  const params = new URLSearchParams({ url });
  if (format) params.set("format", format);
  return `/api/download?${params.toString()}`;
}
