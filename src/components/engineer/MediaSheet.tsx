import { useRef, useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, Video } from "lucide-react";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onSave: () => void;
}

const isVideo = (type: string) => type?.startsWith("video/");

const MediaSheet = ({ job, customer, onClose, onSave }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState<{ url: string; name: string; type: string }[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const path = `${user.id}/${job.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("job-media").upload(path, file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("job-media").getPublicUrl(path);

    await supabase.from("job_media").insert({
      job_id: job.id,
      customer_id: customer.id,
      user_id: user.id,
      file_name: file.name,
      storage_path: path,
      file_type: file.type,
      public_url: urlData.publicUrl,
      uploaded_by: "engineer",
    } as any);

    setMedia((prev) => [...prev, { url: urlData.publicUrl, name: file.name, type: file.type }]);
    toast({ title: isVideo(file.type) ? "Video uploaded" : "Photo uploaded" });
    setUploading(false);
  };

  return (
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
            <div key={i} className="aspect-square rounded-xl overflow-hidden border border-border bg-secondary">
              {isVideo(m.type) ? (
                <video src={m.url} className="w-full h-full object-cover" muted playsInline />
              ) : (
                <img src={m.url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          ))}

          {/* Photo button */}
          <button
            onClick={() => photoRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 cursor-pointer"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Camera className="w-6 h-6" />
                <span className="text-[11px] font-bold">Photo</span>
              </>
            )}
          </button>

          {/* Video button */}
          <button
            onClick={() => videoRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 cursor-pointer"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Video className="w-6 h-6" />
                <span className="text-[11px] font-bold">Video</span>
              </>
            )}
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
  );
};

export default MediaSheet;
