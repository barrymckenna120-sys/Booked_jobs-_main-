import { StickyNote, Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SecondaryActionsProps {
  isActive: boolean;
  onNote: () => void;
  onPhotos: () => void;
  onExtraWork: () => void;
}

const SecondaryActions = ({ isActive, onNote, onPhotos, onExtraWork }: SecondaryActionsProps) => (
  <div className="flex gap-2.5 mb-3">
    <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onNote}>
      <StickyNote className="w-3.5 h-3.5" /> Note
    </Button>
    <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onPhotos}>
      <Camera className="w-3.5 h-3.5" /> Media
    </Button>
    {isActive && (
      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={onExtraWork}>
        <Plus className="w-3.5 h-3.5" /> Extra Work
      </Button>
    )}
  </div>
);

export default SecondaryActions;
