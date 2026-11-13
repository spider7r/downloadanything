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
  channel?: string | null;
  channel_url?: string | null;
  channel_subs?: number | null;
  channel_avatar?: string | null;
  channel_followers?: number | null;
  channel_following?: number | string | null;
  channel_verified?: boolean | null;
  channel_private?: boolean | null;
  channel_likes?: number | null;
  description?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  upload_date?: string | null;
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

/** Analysis runs as a background job server-side (slow shared vCPUs + hosting
 * gateways time out long requests), so start it, then poll until done. */
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
    throw new Error("Can't reach the download server. Is it running? (npm run dev:server)");
  }

  const start = await res
    .json()
    .catch(() => null)
    .then((d) => d as { id?: string; error?: string } | null);
  if (!res.ok || !start?.id) throw new Error(start?.error || "Could not start the analysis");

  // Poll every 1.2s until the server finishes (typical: 2–20 s).
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((r) => setTimeout(r, 1200));
    let poll: Response;
    try {
      poll = await fetch(`/api/info/${start.id}`, { signal });
    } catch (err) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      throw new Error("Lost contact with the download server — please try again.");
    }
    const data = (await poll.json().catch(() => null)) as {
      status?: "working" | "done" | "error";
      info?: MediaInfo | null;
      error?: string | null;
    } | null;
    if (!poll.ok || !data) throw new Error("Lost track of the analysis — please try again.");
    if (data.status === "done" && data.info) return data.info;
    if (data.status === "error") throw new Error(data.error || "Could not analyze this link");
  }
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
