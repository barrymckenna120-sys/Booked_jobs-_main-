import { useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface JobPhotoThumbnailsProps {
  photos: { url: string; name: string }[];
}

const JobPhotoThumbnails = ({ photos }: JobPhotoThumbnailsProps) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  if (!photos || photos.length === 0) return null;

  return (
    <>
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Camera className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">
            📷 {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setSelectedPhoto(p.url)}
              className="w-16 h-16 rounded-xl overflow-hidden border border-border bg-secondary shrink-0 focus:ring-2 focus:ring-primary"
            >
              <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-2 bg-black/95 border-none">
          {selectedPhoto && (
            <img
              src={selectedPhoto}
              alt="Job photo"
              className="w-full h-full object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobPhotoThumbnails;
