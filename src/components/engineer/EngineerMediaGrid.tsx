import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCloudinaryVideoUrl } from "@/lib/cloudinaryUpload";
import { useSignedMediaUrls } from "@/lib/mediaUrl";
import { Play, X, Image, ChevronDown, Video } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type MediaItem = {
  id: string;
  file_name: string;
  file_type: string | null;
  public_url: string | null;
  storage_path: string;
  uploaded_at: string | null;
  uploaded_by: string | null;
};

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|hevc|mkv)(\?|#|$)/i;

const isVideoItem = (m: MediaItem) =>
  m.file_type === "video" ||
  !!m.file_type?.startsWith("video/") ||
  !!(m.public_url && m.public_url.includes("/video/upload/")) ||
  VIDEO_EXT_RE.test(m.public_url || "") ||
  VIDEO_EXT_RE.test(m.file_name || "");

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "Unknown date";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown date";
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
};

const EngineerMediaGrid = ({ jobId }: { jobId: string }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);

  const { data: media = [], isLoading } = useQuery({
    queryKey: ["engineer-job-media", jobId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_media")
        .select("id, file_name, file_type, public_url, storage_path, uploaded_at, uploaded_by")
        .eq("job_id", jobId)
        .order("uploaded_at");
      if (error) throw error;
      return (data || []) as MediaItem[];
    },
  });

  const signedUrls = useSignedMediaUrls(media);

  const getDisplayUrl = (m: MediaItem): string => {
    if (isVideoItem(m) && m.public_url) return getCloudinaryVideoUrl(m.public_url);
    return signedUrls[m.id] || "";
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center justify-between w-full bg-muted/40 rounded-xl px-4 py-3 text-sm font-bold text-foreground">
        <span className="flex items-center gap-2">
          <Video className="w-4 h-4 text-[#4A86E8]" /> Photos & Videos
          {media.length > 0 && (
            <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-bold text-muted-foreground">{media.length}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-2">Loading…</div>
        ) : media.length === 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-muted/50">
            <Image className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No media uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {media.map((m) => {
              const displayUrl = getDisplayUrl(m);
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className="relative rounded-lg overflow-hidden border border-border flex flex-col"
                >
                  <div className="aspect-square relative bg-muted">
                    {isVideoItem(m) ? (
                      <>
                        <video
                          src={displayUrl + "#t=0.1"}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 text-foreground fill-foreground ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={displayUrl}
                        alt={m.file_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="px-2 py-1.5 bg-card border-t border-border text-left">
                    <p className="text-[10px] text-muted-foreground">{formatDate(m.uploaded_at)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CollapsibleContent>

      {/* Lightbox */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <button
            onClick={() => setSelected(null)}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex flex-col items-center justify-center min-h-[50vh] p-2">
            {selected && isVideoItem(selected) ? (
              <video
                src={getDisplayUrl(selected)}
                controls
                autoPlay
                playsInline
                className="max-h-[75vh] max-w-full rounded-lg"
              />
            ) : selected ? (
              <img
                src={getDisplayUrl(selected)}
                alt={selected.file_name}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            ) : null}
            <p className="text-white/60 text-xs mt-3">{formatDate(selected?.uploaded_at || null)}</p>
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
};

export default EngineerMediaGrid;
