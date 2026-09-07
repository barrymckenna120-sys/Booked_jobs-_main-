import { describe, it, expect } from "vitest";
import {
  MAX_VIDEO_BYTES,
  isVideoTooLarge,
  formatFileSize,
  formatDuration,
} from "@/lib/videoPreview";
import { getCloudinaryPosterUrl } from "@/lib/cloudinaryUpload";

describe("video size guard", () => {
  it("allows a normal clip", () => {
    expect(isVideoTooLarge(40 * 1024 * 1024)).toBe(false);
  });

  it("allows exactly the limit", () => {
    expect(isVideoTooLarge(MAX_VIDEO_BYTES)).toBe(false);
  });

  it("rejects above the limit", () => {
    expect(isVideoTooLarge(MAX_VIDEO_BYTES + 1)).toBe(true);
  });
});

describe("formatFileSize", () => {
  it("formats KB, MB and guards bad input", () => {
    expect(formatFileSize(500 * 1024)).toBe("500 KB");
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(formatFileSize(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatFileSize(0)).toBe("0 MB");
    expect(formatFileSize(Number.NaN)).toBe("0 MB");
  });
});

describe("formatDuration", () => {
  it("formats seconds and guards bad input", () => {
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("getCloudinaryPosterUrl", () => {
  it("turns a cloudinary video url into a still jpg", () => {
    expect(
      getCloudinaryPosterUrl(
        "https://res.cloudinary.com/demo/video/upload/v1/jobs/clip.mp4"
      )
    ).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_0,f_jpg,q_auto,w_400/v1/jobs/clip.jpg"
    );
  });

  it("leaves non-cloudinary urls alone", () => {
    expect(getCloudinaryPosterUrl("https://example.com/a.mp4")).toBe(
      "https://example.com/a.mp4"
    );
    expect(getCloudinaryPosterUrl("")).toBe("");
  });
});
