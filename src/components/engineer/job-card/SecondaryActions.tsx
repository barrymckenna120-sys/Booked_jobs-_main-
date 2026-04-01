import { useRef, useState } from "react";
import { StickyNote, Camera, Video, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoUploadSheet from "../VideoUploadSheet";

interface SecondaryActionsProps {
  isActive: boolean;
  job: any;
  customer: any;
  onNote: () => void;
  onPhotos: () => void;
  onExtraWork: () => void;
  onMediaRefresh?: () => void;
}

const SecondaryActions = ({ isActive, job, customer, onNote, onPhotos, onExtraWork, onMediaRefresh }: SecondaryActionsProps) => {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  return (
    <>
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
          >
            <Video className="w-3.5 h-3.5" /> Video
          </Button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
          {isActive && (
          <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-xs h-11"
              style={{ color: "#e8760a", backgroundColor: "#fff8f0", borderColor: "#f5c07a" }}
              onClick={onExtraWork}
            >
              <Plus className="w-3.5 h-3.5" /> Extra Work
            </Button>
          )}
        </div>
      </div>

      {pendingFile && (
        <VideoUploadSheet
          job={job}
          customer={customer}
          file={pendingFile}
          onClose={() => setPendingFile(null)}
          onSuccess={() => { onMediaRefresh?.(); }}
        />
      )}
    </>
  );
};

export default SecondaryActions;
