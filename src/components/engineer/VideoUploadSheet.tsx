import { useState, useRef, useEffect } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadVideoToCloudinary } from "@/lib/cloudinaryUpload";
import { getCloudinaryVideoUrl } from "@/lib/cloudinaryUpload";
import { CheckCircle2, AlertTriangle, RefreshCw, Trash2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  job: any;
  customer: any;
  file: File;
  onClose: () => void;
  onSuccess: () => void;
}

type Stage = "preview" | "uploading" | "success" | "error";

const VideoUploadSheet = ({ job, customer, file, onClose, onSuccess }: Props) => {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("preview");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  const previewUrl = useRef<string>("");

  useEffect(() => {
    previewUrl.current = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(previewUrl.current);
  }, [file]);

  const doUpload = async () => {
    if (!user) return;
    setStage("uploading");
    setProgress(0);
    setErrorMsg("");

    try {
      const result = await uploadVideoToCloudinary(file, (pct) => setProgress(pct));

      await supabase.from("job_media").insert({
        job_id: job.id,
        customer_id: customer?.id,
        user_id: user.id,
        file_name: file.name,
        storage_path: `cloudinary/${result.public_id}`,
        file_type: "video",
        public_url: result.secure_url,
        uploaded_by: "engineer",
      } as any);

      setUploadedUrl(result.secure_url);
      setUploadedAt(new Date());
      setStage("success");
      onSuccess();
      toast({ title: "✅ Video sent successfully", description: "The office has been notified." });
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error — please try again");
      setStage("error");
      toast({ title: "❌ Upload failed", description: "Tap retry to try again.", variant: "destructive" });
    }
  };

  const handleDeleteRetake = () => {
    onClose();
  };

  // Prevent closing during upload
  const handleSheetClose = () => {
    if (stage === "uploading") return;
    onClose();
  };

  return (
    <EngineerSheet onClose={handleSheetClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground">🎬 Video Upload</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {customer?.name} · {file.name}
        </div>
      </div>

      <div className="px-5 pt-4 pb-6 space-y-4">
        {/* PREVIEW stage */}
        {stage === "preview" && (
          <>
            <div className="rounded-xl overflow-hidden border border-border bg-black">
              <video
                src={previewUrl.current}
                controls
                playsInline
                className="w-full max-h-[50vh] object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Review your video before sending
            </p>
            <Button
              className="w-full h-14 text-base font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={doUpload}
            >
              <Send className="w-5 h-5" /> Send Video
            </Button>
            <Button
              variant="destructive"
              className="w-full h-12 text-sm font-bold gap-2"
              onClick={handleDeleteRetake}
            >
              <Trash2 className="w-4 h-4" /> Delete & Retake
            </Button>
          </>
        )}

        {/* UPLOADING stage */}
        {stage === "uploading" && (
          <div className="space-y-4 py-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Send className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-bold text-foreground">Uploading video… please wait</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span>Sending to server</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <p className="text-[11px] text-destructive/80 text-center font-semibold">
              ⚠️ Please don't close this screen
            </p>
          </div>
        )}

        {/* SUCCESS stage */}
        {stage === "success" && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <p className="text-base font-extrabold text-emerald-600">✅ Video sent successfully</p>
            </div>

            {uploadedUrl && (
              <div className="rounded-xl overflow-hidden border border-border bg-black">
                <video
                  src={getCloudinaryVideoUrl(uploadedUrl)}
                  controls
                  playsInline
                  className="w-full max-h-[30vh] object-contain"
                />
              </div>
            )}

            {uploadedAt && (
              <p className="text-[11px] text-muted-foreground text-center">
                Uploaded {uploadedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
                {uploadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            <Button className="w-full h-12 text-base font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onClose}>
              ✅ Done
            </Button>
          </>
        )}

        {/* ERROR stage */}
        {stage === "error" && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-9 h-9 text-destructive" />
              </div>
              <p className="text-base font-extrabold text-destructive">❌ Upload failed — tap to retry</p>
              <p className="text-xs text-muted-foreground text-center">{errorMsg}</p>
            </div>

            <Button
              className="w-full h-14 text-base font-extrabold gap-2"
              variant="destructive"
              onClick={doUpload}
            >
              <RefreshCw className="w-5 h-5" /> Retry Upload
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 text-sm font-semibold"
              onClick={onClose}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </EngineerSheet>
  );
};

export default VideoUploadSheet;
