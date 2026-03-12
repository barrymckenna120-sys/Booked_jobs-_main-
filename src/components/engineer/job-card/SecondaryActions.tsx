import { useRef, useState } from "react";
import { StickyNote, Camera, Video, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { uploadVideoToCloudinary } from "@/lib/cloudinaryUpload";

interface SecondaryActionsProps {
  isActive: boolean;
  job: any;
  customer: any;
  onNote: () => void;
  onPhotos: () => void;
  onExtraWork: () => void;
}

const SecondaryActions = ({ isActive, job, customer, onNote, onPhotos, onExtraWork }: SecondaryActionsProps) => {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !job) return;
    setUploading(true);
    setProgress(0);

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

      toast({ title: "Video uploaded ✓" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 mb-3">
      <div className="flex gap-2.5">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onNote}>
          <StickyNote className="w-3.5 h-3.5" /> Note
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onPhotos}>
          <Camera className="w-3.5 h-3.5" /> Media
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-xs h-11"
          onClick={() => videoInputRef.current?.click()}
          disabled={uploading}
        >
          <Video className="w-3.5 h-3.5" /> {uploading ? `${progress}%` : "Video"}
        </Button>
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={handleVideoUpload}
        />
        {isActive && (
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onExtraWork}>
            <Plus className="w-3.5 h-3.5" /> Extra Work
          </Button>
        )}
      </div>
      {uploading && (
        <Progress value={progress} className="h-1.5" />
      )}
    </div>
  );
};

export default SecondaryActions;
