// Typed API layer for the Download Anything backend.

export type MediaFormat = {
  format_id: string;
  ext: string;
  height?: number | null;
  fps?: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
  format_note?: string | null;
};

export type MediaInfo = {
  title: string;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  webpage_url?: string | null;
  extractor?: string | null;
  formats: MediaFormat[];
};

export type JobStatus = "starting" | "downloading" | "converting" | "done" | "error" | "expired";

export type Job = {
  id: string;
  status: JobStatus;
  percent: number;
  speed: string;
  eta: string;
  filename: string | null;
  title: string | null;
  error: string | null;
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
    throw new Error("Can't reach the download server. Is it running? (pnpm dev:server)");
  }

  const text = await res.text();
  let data: (MediaInfo & { error?: string }) | null = null;
  try {
    data = JSON.parse(text) as MediaInfo & { error?: string };
  } catch {
    throw new Error(
      res.status === 502 || res.status === 500
        ? "The download server is offline or restarting. Please try again in a moment."
        : `Unexpected server response (HTTP ${res.status}).`,
    );
  }
  if (!res.ok) throw new Error(data?.error || `Could not fetch this link (HTTP ${res.status})`);
  if (!data) throw new Error("Empty response from server");
  return data;
}

export async function startDownload(options: {
  url: string;
  format?: string;
  mp3?: boolean;
}): Promise<string> {
  const res = await fetch("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(data.error || "Could not start the download");
  return data.id;
}

export async function pollJob(id: string): Promise<Job> {
  const res = await fetch(`/api/progress/${id}`);
  const data = (await res.json()) as Job & { error?: string };
  if (!res.ok) throw new Error(data.error || "Lost track of this download");
  return data;
}

export async function cancelJob(id: string): Promise<void> {
  await fetch(`/api/download/${id}`, { method: "DELETE" }).catch(() => {});
}

export function fileUrl(id: string): string {
  return `/api/file/${id}`;
}

/** Trigger an automatic "save-file" download without navigating away. */
export function triggerSave(jobId: string): void {
  const a = document.createElement("a");
  a.href = fileUrl(jobId);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
