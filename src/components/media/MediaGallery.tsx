import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, X, Play } from "lucide-react";
import { getCloudinaryVideoUrl, uploadVideoToCloudinary } from "@/lib/cloudinaryUpload";

type MediaItem = {
  id: string;
  file_name: string;
  file_type: string | null;
  public_url: string | null;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_at: string | null;
};

type Props = {
  jobId: string;
  showUpload?: boolean;
  onUpload?: () => void;
};

const isVideoItem = (m: MediaItem) =>
  m.file_type === "video" ||
  m.file_type?.startsWith("video/") ||
  (m.public_url && m.public_url.includes("cloudinary.com"));

const MediaGallery = ({ jobId, showUpload, onUpload }: Props) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    fetchMedia();
  }, [jobId]);

  const fetchMedia = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("job_media")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at");
    setMedia((data || []) as MediaItem[]);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      const { data: jobData } = await supabase
        .from("service_calls")
        .select("customer_id")
        .eq("id", jobId)
        .single();

      const customerId = jobData?.customer_id;
      const fileName = `engineer-${Date.now()}-${file.name}`;
      const storagePath = `customers/${customerId}/${jobId}/${fileName}`;
      const isVideo = /\.(mp4|mov|avi)$/i.test(file.name);

      await supabase.storage.from("job-media").upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });

      const { data: { publicUrl } } = supabase.storage.from("job-media").getPublicUrl(storagePath);

      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("job_media").insert({
        job_id: jobId,
        customer_id: customerId,
        user_id: user?.id,
        file_name: fileName,
        file_type: isVideo ? "video" : "image",
        storage_path: storagePath,
        public_url: publicUrl,
        uploaded_by: "engineer",
      } as any);
    }

    fetchMedia();
    onUpload?.();
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading media...</p>;
  if (media.length === 0 && !showUpload) return <p className="text-xs text-muted-foreground">No photos or videos</p>;

  const current = lightboxIndex !== null ? media[lightboxIndex] : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {media.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setLightboxIndex(i)}
            className="relative rounded-lg overflow-hidden border border-border h-[160px] group hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer"
          >
            {m.file_type === "video" || (m.public_url && m.public_url.includes("cloudinary.com")) ? (
              <div className="w-full h-full bg-foreground/10 flex items-center justify-center">
                <Play className="w-10 h-10 text-background/80" />
                <span className="absolute bottom-2 left-2 text-[10px] text-background bg-foreground/60 px-1.5 py-0.5 rounded">{m.file_name}</span>
              </div>
            ) : (
              <img
                src={m.public_url || ""}
                alt={m.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
            <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-background/80 text-foreground">
              {m.uploaded_by === "engineer" ? "📋 Engineer" : "📷 Customer"}
            </span>
          </button>
        ))}
      </div>

      {showUpload && (
        <label className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-semibold cursor-pointer hover:underline">
          📷 Add Photos
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileUpload} />
        </label>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxIndex !== null} onOpenChange={() => setLightboxIndex(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white z-10"
              onClick={() => setLightboxIndex(null)}
            >
              <X className="w-5 h-5" />
            </Button>

            {media.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 text-white z-10"
                  onClick={() => setLightboxIndex((lightboxIndex! - 1 + media.length) % media.length)}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 text-white z-10"
                  onClick={() => setLightboxIndex((lightboxIndex! + 1) % media.length)}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </>
            )}

            {current?.file_type === "video" || (current?.public_url && current.public_url.includes("cloudinary.com")) ? (
              <video src={getCloudinaryVideoUrl(current.public_url || "")} controls className="max-h-[80vh] max-w-full" autoPlay />
            ) : (
              <img src={current?.public_url || ""} alt={current?.file_name} className="max-h-[80vh] max-w-full object-contain" />
            )}
          </div>
          <p className="text-center text-white/60 text-xs pb-3">{current?.file_name}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MediaGallery;
