import { useState } from "react";
import { Camera, Play } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MediaItem {
  url: string;
  name: string;
  type?: string;
}

interface JobPhotoThumbnailsProps {
  photos: MediaItem[];
}

const isVideo = (item: MediaItem) =>
  item.type?.startsWith("video/") || /\.(mp4|mov|webm|avi)$/i.test(item.name);

const JobPhotoThumbnails = ({ photos }: JobPhotoThumbnailsProps) => {
  const [selected, setSelected] = useState<MediaItem | null>(null);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Camera className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            📷 {photos.length}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setSelected(p)}
              className="w-16 h-16 rounded-xl overflow-hidden border border-border bg-secondary shrink-0 focus:ring-2 focus:ring-primary relative"
            >
              {isVideo(p) ? (
                <>
                  <video src={p.url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-5 h-5 text-white fill-white" />
                  </div>
                </>
              ) : (
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-2 bg-black/95 border-none">
          {selected && isVideo(selected) ? (
            <video
              src={selected.url}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-lg"
            />
          ) : selected ? (
            <img
              src={selected.url}
              alt="Job photo"
              className="w-full h-full object-contain rounded-lg"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobPhotoThumbnails;
