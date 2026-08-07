/**
 * Tolerant normalisation of the `photo_video_upload` field into `string[]`.
 *
 * Accepted shapes:
 *  1. "https://a.jpg"                              single URL string
 *  2. "[\"https://a.jpg\",\"https://b.png\"]"      JSON array serialised as a string
 *  3. ["https://a.jpg", "https://b.png"]           real JSON array of strings
 *  4. [{ url: "https://a.jpg", name, mimeType }]   original Tally file objects
 *  5. { url: "https://a.jpg" }                     single Tally file object
 *
 * Anything that is not an http(s) URL is dropped. Duplicates are removed,
 * original order preserved.
 */
const URL_RE = /^https?:\/\/\S+$/i;

const walk = (input: unknown, depth = 0): string[] => {
  if (input == null || depth > 4) return [];

  if (Array.isArray(input)) {
    return input.flatMap((entry) => walk(entry, depth + 1));
  }

  if (typeof input === "object") {
    const url = (input as { url?: unknown }).url;
    return typeof url === "string" ? walk(url, depth + 1) : [];
  }

  if (typeof input !== "string") return [];

  const raw = input.trim();
  if (!raw) return [];

  // JSON-encoded array or object sent as a string
  if (/^[[{]/.test(raw)) {
    try {
      return walk(JSON.parse(raw), depth + 1);
    } catch {
      // fall through to delimiter splitting
    }
  }

  // JSON-encoded array or object sent as a string
  if (/^[[{]/.test(raw)) {
    try {
      return walk(JSON.parse(raw), depth + 1);
    } catch {
      // Not valid JSON: fall through and treat as a single URL.
    }
  }

  return URL_RE.test(raw) ? [raw] : [];
};

export const normaliseMediaUrls = (input: unknown): string[] => {
  return Array.from(new Set(walk(input)));
};
