/**
 * Video capture safety helpers (BJ — iPhone PWA freeze).
 *
 * iOS Safari runs the page in a single process with a hard memory ceiling, and
 * a camera recording is commonly 100-400 MB of HEVC. Decoding that raw file
 * inside the app is what locked the whole PWA up, so these helpers let the UI
 * (a) refuse clips that are too big and (b) show a single still frame instead
 * of a live <video> element.
 */

/** Hard ceiling for an engineer video upload. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

export const isVideoTooLarge = (size: number): boolean => size > MAX_VIDEO_BYTES;

export const TOO_LARGE_MESSAGE =
  "This video is too large to send — record a shorter clip, about 30 seconds.";

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

export const formatDuration = (seconds: number | null): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

export interface StillFrame {
  dataUrl: string | null;
  duration: number | null;
}

/**
 * Grab ONE still frame from a local file, then tear the video element down.
 *
 * Deliberately short-lived and time-boxed: if the device cannot decode the
 * clip quickly we give up and the caller shows a plain file card. We never
 * keep a decoder alive while the engineer reads the screen.
 */
export const extractStillFrame = (file: File, timeoutMs = 3000): Promise<StillFrame> =>
  new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ dataUrl: null, duration: null });
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    };

    const finish = (frame: StillFrame) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(frame);
    };

    const timer = setTimeout(() => finish({ dataUrl: null, duration: null }), timeoutMs);

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      } catch {
        finish({ dataUrl: null, duration: null });
      }
    };

    video.onseeked = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish({ dataUrl: null, duration });
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), duration });
      } catch {
        finish({ dataUrl: null, duration });
      }
    };

    video.onerror = () => finish({ dataUrl: null, duration: null });

    video.src = url;
  });
