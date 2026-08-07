import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, X, Play, Trash2 } from "lucide-react";
import { getCloudinaryVideoUrl, uploadVideoToCloudinary } from "@/lib/cloudinaryUpload";
import { useToast } from "@/hooks/use-toast";
import { useSignedMediaUrls } from "@/lib/mediaUrl";

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

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|hevc|mkv)(\?|#|$)/i;

const isVideoItem = (m: MediaItem) =>
  m.file_type === "video" ||
  !!m.file_type?.startsWith("video/") ||
  !!(m.public_url && m.public_url.includes("/video/upload/")) ||
  VIDEO_EXT_RE.test(m.public_url || "") ||
  VIDEO_EXT_RE.test(m.file_name || "");

const formatDuration = (seconds: number): string | null => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/** Hook to detect video durations from Cloudinary MP4 URLs */
const useVideoDurations = (media: MediaItem[]) => {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const resolved = useRef<Set<string>>(new Set());

  useEffect(() => {
    media.forEach((m) => {
      if (!isVideoItem(m) || !m.public_url || resolved.current.has(m.id)) return;
      resolved.current.add(m.id);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = getCloudinaryVideoUrl(m.public_url);
      video.onloadedmetadata = () => {
        if (isFinite(video.duration)) {
          setDurations((prev) => ({ ...prev, [m.id]: video.duration }));
        }
        video.src = "";
      };
    });
  }, [media]);

  return durations;
};

const MediaGallery = ({ jobId, showUpload, onUpload }: Props) => {
  const { toast } = useToast();
  const { orgId } = useOrgId();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const durations = useVideoDurations(media);
  const signedUrls = useSignedMediaUrls(media);

  const getDisplayUrl = (m: MediaItem): string => {
    if (isVideoItem(m) && m.public_url) return getCloudinaryVideoUrl(m.public_url);
    return signedUrls[m.id] || "";
  };

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
    setUploading(true);
    setUploadProgress(0);

    for (const file of Array.from(files)) {
      const { data: jobData } = await supabase
        .from("service_calls")
        .select("customer_id")
        .eq("id", jobId)
        .single();

      const customerId = jobData?.customer_id;
      const fileName = `engineer-${Date.now()}-${file.name}`;
      const isVideo = file.type?.startsWith("video/") || /\.(mp4|mov|avi|hevc|webm)$/i.test(file.name);
      const { data: { user } } = await supabase.auth.getUser();

      let publicUrl: string | null = null;
      let storagePath: string;

      if (isVideo) {
        const result = await uploadVideoToCloudinary(file, (pct) => setUploadProgress(pct));
        publicUrl = result.secure_url;
        storagePath = `cloudinary/${result.public_id}`;
      } else {
        storagePath = `customers/${customerId}/${jobId}/${fileName}`;
        await supabase.storage.from("job-media").upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });
        // No public URL needed — signed URLs are used for display
      }

      await supabase.from("job_media").insert({
        organisation_id: orgId!,
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

    setUploading(false);
    setUploadProgress(0);
    fetchMedia();
    onUpload?.();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (!deleteTarget.storage_path.startsWith("cloudinary/")) {
        await supabase.storage.from("job-media").remove([deleteTarget.storage_path]);
      }
      await supabase.from("job_media").delete().eq("id", deleteTarget.id);
      setMedia((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (lightboxIndex !== null && media[lightboxIndex]?.id === deleteTarget.id) {
        setLightboxIndex(null);
      }
      toast({ title: "Media deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <p className="text-xs text-muted-foreground">Loading media...</p>;
  if (media.length === 0 && !showUpload) return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Play className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">No photos or videos yet</p>
    </div>
  );

  const current = lightboxIndex !== null ? media[lightboxIndex] : null;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {media.map((m, i) => {
          const displayUrl = getDisplayUrl(m);
          return (
            <button
              key={m.id}
              onClick={() => setLightboxIndex(i)}
              className="relative rounded-lg overflow-hidden border border-border group hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer flex flex-col"
            >
              <div
                role="button"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(m); }}
                className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </div>
              <div className="aspect-square relative">
                {isVideoItem(m) ? (
                  <>
                    <video
                      src={displayUrl + "#t=0.1"}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-foreground fill-foreground ml-0.5" />
                      </div>
                    </div>
                    {formatDuration(durations[m.id]) ? (
                      <span className="absolute top-2 right-2 text-[11px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                        {formatDuration(durations[m.id])}
                      </span>
                    ) : null}
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
                <p className="text-[11px] text-muted-foreground">
                  {(() => {
                    if (!m.uploaded_at) return 'Unknown date';
                    const d = new Date(m.uploaded_at);
                    if (isNaN(d.getTime())) return 'Unknown date';
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {m.uploaded_by === "engineer" ? "📋 Engineer" : "📷 Customer"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {uploading && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-primary">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-1.5" />
        </div>
      )}

      {showUpload && (
        <label className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-semibold cursor-pointer hover:underline">
          📷 Add Photos / Videos
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

            {current && isVideoItem(current) ? (
              <video src={getDisplayUrl(current)} controls className="max-h-[80vh] max-w-full" autoPlay playsInline />
            ) : (
              <img src={current ? getDisplayUrl(current) : ""} alt={current?.file_name} className="max-h-[80vh] max-w-full object-contain" />
            )}
          </div>
          <div className="flex items-center justify-center gap-3 pb-3">
            <p className="text-white/60 text-xs">{current?.file_name}</p>
            {current && (
              <button
                onClick={() => { setDeleteTarget(current); setLightboxIndex(null); }}
                className="text-xs text-destructive hover:text-destructive/80 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteTarget && isVideoItem(deleteTarget) ? "video" : "photo"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deleteTarget?.file_name}" from this job. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MediaGallery;
