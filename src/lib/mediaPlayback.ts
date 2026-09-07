import { getCloudinaryPosterUrl, getCloudinaryVideoUrl } from "@/lib/cloudinaryUpload";

/**
 * Single source of truth for how a stored video is shown.
 *
 * Rules (learned from the iPhone freeze investigation):
 * - Grids and thumbnails NEVER mount a <video>. One decoder per tile is what
 *   locks up iOS Safari. They use a still poster image instead.
 * - Playback always goes through one <video> at a time, using a browser-safe
 *   MP4 URL where the host can give us one.
 */

export const isCloudinaryUrl = (url: string | null | undefined): boolean =>
  !!url && url.includes("cloudinary.com");

/** Still frame for a tile, or null when the host cannot produce one. */
export const getVideoPosterUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (!isCloudinaryUrl(url)) return null;
  return getCloudinaryPosterUrl(url);
};

/** Best URL for actually playing the clip. */
export const getVideoPlaybackUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  return getCloudinaryVideoUrl(url);
};

/**
 * QuickTime/HEVC files served straight from our own storage play on iPhone but
 * not in desktop Chrome or Firefox. We can still offer a download instead of
 * showing a silent black rectangle.
 */
export const mayNeedDownloadFallback = (url: string | null | undefined): boolean =>
  !!url && !isCloudinaryUrl(url) && /\.(mov|m4v|hevc|mkv|avi)(\?|#|$)/i.test(url);

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|hevc|mkv)(\?|#|$)/i;

/** Shared video detection used by every media surface. */
export const isVideoMedia = (m: {
  file_type?: string | null;
  type?: string | null;
  public_url?: string | null;
  url?: string | null;
  file_name?: string | null;
  name?: string | null;
}): boolean => {
  const type = m.file_type ?? m.type ?? null;
  const url = m.public_url ?? m.url ?? null;
  const name = m.file_name ?? m.name ?? null;
  return (
    type === "video" ||
    !!type?.startsWith("video/") ||
    !!(url && url.includes("/video/upload/")) ||
    VIDEO_EXT_RE.test(url || "") ||
    VIDEO_EXT_RE.test(name || "")
  );
};
