import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getVideoPlaybackUrl, mayNeedDownloadFallback } from "@/lib/mediaPlayback";

interface Props {
  url: string | null | undefined;
  name?: string | null;
  className?: string;
}

/**
 * The only place a stored video is played. Mounted one at a time, and the
 * decoder is explicitly torn down when it closes — leaving decoders alive is
 * what made fast navigation freeze the iPhone PWA.
 */
const VideoPlayer = ({ url, name, className }: Props) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const src = getVideoPlaybackUrl(url);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  // Tear the decoder down on unmount ONLY. Running this when the source
  // changes would strip the src React had just set for the next video.
  useEffect(() => {
    const video = ref.current;
    return () => {
      if (!video) return;
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
    };
  }, []);

  if (!src) return null;

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm font-semibold text-white">This video can’t be played in this browser</p>
        {mayNeedDownloadFallback(url) && (
          <p className="text-xs text-white/60">
            It was recorded in an Apple-only format. It plays on iPhone and Mac Safari.
          </p>
        )}
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-bold text-white underline"
        >
          Open or download the video
        </a>
      </div>
    );
  }

  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      aria-label={name || "Job video"}
      onError={() => setFailed(true)}
      className={className || "max-h-[75vh] max-w-full rounded-lg"}
    />
  );
};

export default VideoPlayer;
