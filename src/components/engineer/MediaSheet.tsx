import { useRef, useState, useEffect } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Camera, Video, Play, X } from "lucide-react";
import { getCloudinaryVideoUrl } from "@/lib/cloudinaryUpload";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import VideoUploadSheet from "./VideoUploadSheet";
import { getSignedUrl } from "@/lib/mediaUrl";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onSave: () => void;
}

interface MediaFile {
  url: string;
  name: string;
  type: string;
}

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|hevc|mkv)(\?|#|$)/i;

const isVideo = (type: string) =>
  type?.startsWith("video/") || type === "video";


const getCloudinaryThumbnail = (url: string): string => {
  if (!url || !url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/so_0,f_jpg,q_auto/").replace(/\.[^.]+$/, ".jpg");
};

const MediaSheet = ({ job, customer, onClose, onSave }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);

  // Load existing media from DB on mount, resolving signed URLs
  useEffect(() => {
    const loadMedia = async () => {
      const { data } = await supabase
        .from("job_media")
        .select("file_name, file_type, public_url, storage_path")
        .eq("job_id", job.id)
        .order("uploaded_at");
      if (data) {
        const resolved = await Promise.all(
          data.map(async (m: any) => {
            const isCloudinary = m.public_url && m.public_url.includes("cloudinary.com");
            if (isCloudinary) {
              return { url: m.public_url || "", name: m.file_name, type: m.file_type || "image" };
            }
            // Get signed URL for Supabase storage items
            const signedUrl = await getSignedUrl(m.storage_path);
            return { url: signedUrl || "", name: m.file_name, type: m.file_type || "image" };
          })
        );
        setMedia(resolved);
      }
    };
    loadMedia();
  }, [job.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (isVideo(file.type) || /\.(mp4|mov|avi|hevc|webm)$/i.test(file.name)) {
      setPendingVideoFile(file);
      if (videoRef.current) videoRef.current.value = "";
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const path = `${user.id}/${job.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("job-media").upload(path, file);
      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        setUploading(false);
        return;
      }

      // Get signed URL for immediate display
      const signedUrl = await getSignedUrl(path);

      await supabase.from("job_media").insert({
        organisation_id: job.organisation_id,
        job_id: job.id,
        customer_id: customer.id,
        user_id: user.id,
        file_name: file.name,
        storage_path: path,
        file_type: "image",
        public_url: null,
        uploaded_by: "engineer",
      } as any);

      setMedia((prev) => [...prev, { url: signedUrl || "", name: file.name, type: file.type }]);
      toast({ title: "Photo uploaded ✓" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const isMediaVideo = (m: MediaFile) =>
    isVideo(m.type) ||
    (m.url?.includes("/video/upload/") ?? false) ||
    VIDEO_EXT_RE.test(m.url || "") ||
    VIDEO_EXT_RE.test(m.name || "");

  const reloadMedia = async () => {
    const { data } = await supabase
      .from("job_media")
      .select("file_name, file_type, public_url, storage_path")
      .eq("job_id", job.id)
      .order("uploaded_at");
    if (data) {
      const resolved = await Promise.all(
        data.map(async (m: any) => {
          const isCloudinary = m.public_url && m.public_url.includes("cloudinary.com");
          if (isCloudinary) {
            return { url: m.public_url || "", name: m.file_name, type: m.file_type || "image" };
          }
          const signedUrl = await getSignedUrl(m.storage_path);
          return { url: signedUrl || "", name: m.file_name, type: m.file_type || "image" };
        })
      );
      setMedia(resolved);
    }
  };

  return (
    <>
      <EngineerSheet onClose={onClose}>
        <div className="px-5 py-3 border-b border-border">
          <div className="text-xl font-extrabold text-foreground">📷 Media</div>
          <div className="text-[13px] text-muted-foreground mt-0.5">
            {customer.name} · {media.length} file{media.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="px-5 pt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2.5">
            {media.map((m, i) => (
              <button
                key={i}
                onClick={() => setSelectedMedia(m)}
                className="aspect-square rounded-xl overflow-hidden border border-border bg-secondary relative"
              >
                {isMediaVideo(m) ? (
                  <>
                    <video
                      src={getCloudinaryVideoUrl(m.url || "") + "#t=0.1"}
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
                  <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                )}
              </button>
            ))}

            {uploading && (
              <div className="col-span-full space-y-1.5 py-2">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span>Uploading photo…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <button
              onClick={() => photoRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 cursor-pointer"
              disabled={uploading}
            >
              <Camera className="w-6 h-6" />
              <span className="text-[11px] font-bold">Photo</span>
            </button>

            <button
              onClick={() => videoRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 cursor-pointer"
              disabled={uploading}
            >
              <Video className="w-6 h-6" />
              <span className="text-[11px] font-bold">Video</span>
            </button>
          </div>

          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleFile} />

          <div className="bg-primary/5 rounded-xl p-3 text-[13px] text-primary font-semibold">
            💡 Photos and videos are uploaded and visible to the office immediately.
          </div>

          <Button className="w-full h-12 text-base font-extrabold" onClick={onSave}>
            💾 Done
          </Button>
          <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">
            Cancel
          </button>
        </div>
      </EngineerSheet>

      {/* Fullscreen media viewer */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <button
            onClick={() => setSelectedMedia(null)}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center justify-center min-h-[50vh] p-2">
            {selectedMedia && isMediaVideo(selectedMedia) ? (
              <video
                src={getCloudinaryVideoUrl(selectedMedia.url || "")}
                controls
                autoPlay
                playsInline
                className="max-h-[75vh] max-w-full rounded-lg"
              />
            ) : (
              <img
                src={selectedMedia?.url || ""}
                alt={selectedMedia?.name}
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Video preview/confirm sheet */}
      {pendingVideoFile && (
        <VideoUploadSheet
          job={job}
          customer={customer}
          file={pendingVideoFile}
          onClose={() => setPendingVideoFile(null)}
          onSuccess={() => {
            reloadMedia();
            setPendingVideoFile(null);
          }}
        />
      )}
    </>
  );
};

export default MediaSheet;
