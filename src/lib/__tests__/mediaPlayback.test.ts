import { describe, it, expect } from "vitest";
import {
  getVideoPosterUrl,
  getVideoPlaybackUrl,
  isVideoMedia,
  mayNeedDownloadFallback,
} from "@/lib/mediaPlayback";

const CLD = "https://res.cloudinary.com/demo/video/upload/v1/jobs/clip.mov";
const STORAGE = "https://x.supabase.co/storage/v1/object/public/job-media/a/b/clip.MOV";

describe("getVideoPosterUrl", () => {
  it("returns a still frame for hosted clips", () => {
    expect(getVideoPosterUrl(CLD)).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_0,f_jpg,q_auto,w_400/v1/jobs/clip.jpg"
    );
  });

  it("returns null when no still frame can be produced", () => {
    expect(getVideoPosterUrl(STORAGE)).toBeNull();
    expect(getVideoPosterUrl(null)).toBeNull();
    expect(getVideoPosterUrl("")).toBeNull();
  });
});

describe("getVideoPlaybackUrl", () => {
  it("uses a browser-safe MP4 for hosted clips", () => {
    expect(getVideoPlaybackUrl(CLD)).toContain("/upload/f_mp4,q_auto/");
  });

  it("passes other URLs through unchanged", () => {
    expect(getVideoPlaybackUrl(STORAGE)).toBe(STORAGE);
    expect(getVideoPlaybackUrl(null)).toBe("");
  });
});

describe("mayNeedDownloadFallback", () => {
  it("flags Apple-only formats served from our own storage", () => {
    expect(mayNeedDownloadFallback(STORAGE)).toBe(true);
    expect(mayNeedDownloadFallback(CLD)).toBe(false);
    expect(mayNeedDownloadFallback("https://x/a.jpg")).toBe(false);
  });
});

describe("isVideoMedia", () => {
  it("detects videos from any of the stored shapes", () => {
    expect(isVideoMedia({ file_type: "video" })).toBe(true);
    expect(isVideoMedia({ type: "video/quicktime" })).toBe(true);
    expect(isVideoMedia({ public_url: CLD })).toBe(true);
    expect(isVideoMedia({ url: STORAGE })).toBe(true);
    expect(isVideoMedia({ name: "site.mp4" })).toBe(true);
  });

  it("does not treat photos as videos", () => {
    expect(isVideoMedia({ file_type: "image/jpeg", file_name: "boiler.jpg" })).toBe(false);
    expect(isVideoMedia({})).toBe(false);
  });
});
