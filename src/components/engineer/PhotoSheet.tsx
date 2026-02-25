import { useRef, useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onSave: () => void;
}

const PhotoSheet = ({ job, customer, onClose, onSave }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);

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

    setPhotos((prev) => [...prev, { url: urlData.publicUrl, name: file.name }]);
    toast({ title: "Photo uploaded" });
    setUploading(false);
  };

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground">📷 Photos</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {customer.name} · {photos.length} photo{photos.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="px-5 pt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2.5">
          {photos.map((p, i) => (
            <div key={i} className="aspect-square rounded-xl overflow-hidden border border-border bg-secondary">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary flex flex-col items-center justify-center gap-1 cursor-pointer"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span className="text-2xl">📷</span>
                <span className="text-[11px] font-bold">Take Photo</span>
              </>
            )}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

        <div className="bg-primary/5 rounded-xl p-3 text-[13px] text-primary font-semibold">
          💡 Photos are uploaded and visible to the office immediately.
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

export default PhotoSheet;
