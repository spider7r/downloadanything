// Platform registry: name + URL detection regex + brand accent + extractor mapping.

export type Platform = {
  key: string;
  name: string;
  match: RegExp;
  color: string; // brand-ish accent
  extractors: string[]; // yt-dlp extractor_key prefixes that map to this platform
};

export const PLATFORMS: Platform[] = [
  { key: "youtube", name: "YouTube", match: /youtube\.com|youtu\.be/i, color: "#FF0033", extractors: ["Youtube"] },
  { key: "tiktok", name: "TikTok", match: /tiktok\.com/i, color: "#25F4EE", extractors: ["TikTok"] },
  { key: "instagram", name: "Instagram", match: /instagram\.com/i, color: "#E1306C", extractors: ["Instagram"] },
  { key: "x", name: "X", match: /(?:^|\.|\/\/)x\.com|twitter\.com/i, color: "#E7E9EA", extractors: ["Twitter"] },
  { key: "facebook", name: "Facebook", match: /facebook\.com|fb\.watch/i, color: "#1877F2", extractors: ["Facebook"] },
  { key: "reddit", name: "Reddit", match: /reddit\.com|redd\.it/i, color: "#FF4500", extractors: ["Reddit"] },
  { key: "soundcloud", name: "SoundCloud", match: /soundcloud\.com/i, color: "#FF5500", extractors: ["Soundcloud"] },
  { key: "twitch", name: "Twitch", match: /twitch\.tv/i, color: "#9146FF", extractors: ["Twitch"] },
  { key: "vimeo", name: "Vimeo", match: /vimeo\.com/i, color: "#19B7EA", extractors: ["Vimeo"] },
  { key: "pinterest", name: "Pinterest", match: /pinterest\./i, color: "#E60023", extractors: ["Pinterest"] },
  { key: "dailymotion", name: "Dailymotion", match: /dailymotion\.com|dai\.ly/i, color: "#00AAFF", extractors: ["Dailymotion"] },
  { key: "bilibili", name: "Bilibili", match: /bilibili\.com/i, color: "#00A1D6", extractors: ["Bili"] },
  { key: "rumble", name: "Rumble", match: /rumble\.com/i, color: "#85C742", extractors: ["Rumble"] },
  { key: "vk", name: "VK", match: /vk\.com|vk\.ru/i, color: "#0077FF", extractors: ["VK", "Vk"] },
  { key: "tumblr", name: "Tumblr", match: /tumblr\.com/i, color: "#36465D", extractors: ["Tumblr"] },
  { key: "snapchat", name: "Snapchat", match: /snapchat\.com/i, color: "#FFFC00", extractors: ["Snapchat"] },
  { key: "threads", name: "Threads", match: /threads\.(net|com)/i, color: "#E7E9EA", extractors: ["Threads"] },
  { key: "bluesky", name: "Bluesky", match: /bsky\.app/i, color: "#4C9EFF", extractors: ["Bluesky"] },
];

/** Detect the platform from a (possibly partially typed) URL, or null if unknown. */
export function detectPlatform(url: string): Platform | null {
  if (!url) return null;
  return PLATFORMS.find((p) => p.match.test(url)) ?? null;
}

/** Map a yt-dlp extractor_key (e.g. "Youtube", "TikTokUrl1") to a platform. */
export function platformFromExtractor(extractor?: string | null): Platform | null {
  if (!extractor) return null;
  for (const p of PLATFORMS) {
    if (p.extractors.some((e) => extractor.toLowerCase().startsWith(e.toLowerCase()))) return p;
  }
  return null;
}

/** 1,000-scale abbreviations: 941 / 12.4K / 3.7M */
export function formatCount(n?: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** "20240227" -> "Feb 27, 2024" */
export function formatDate(upload_date?: string | null): string {
  if (!upload_date || upload_date.length !== 8) return "";
  const y = +upload_date.slice(0, 4);
  const m = +upload_date.slice(4, 6) - 1;
  const d = +upload_date.slice(6, 8);
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
