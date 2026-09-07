import { Play, Film } from "lucide-react";
import { getVideoPosterUrl } from "@/lib/mediaPlayback";

interface Props {
  url: string | null | undefined;
  name?: string | null;
  /** Extra classes for the badge overlay size, defaults suit a small tile. */
  large?: boolean;
}

/**
 * Video tile — a still image plus a play badge, never a <video> element.
 * Mounting a decoder per tile is what froze the iPhone PWA.
 */
const VideoThumb = ({ url, name, large }: Props) => {
  const poster = getVideoPosterUrl(url);
  const badge = large ? "w-12 h-12" : "w-10 h-10";
  const icon = large ? "w-6 h-6" : "w-5 h-5";

  return (
    <>
      {poster ? (
        <img
          src={poster}
          alt={name || "Video"}
          loading="lazy"
          className="w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-black/85">
          <Film className="w-5 h-5 text-white/70" />
          <span className="text-[10px] font-semibold text-white/70">Video</span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
        <div className={`${badge} rounded-full bg-background/90 flex items-center justify-center shadow-lg`}>
          <Play className={`${icon} text-foreground fill-foreground ml-0.5`} />
        </div>
      </div>
    </>
  );
};

export default VideoThumb;
