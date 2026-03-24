import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  loading?: boolean;
}

const PartsNeededSheet = ({ open, onClose, onConfirm, loading }: Props) => {
  const [notes, setNotes] = useState("");

  if (!open) return null;

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onConfirm(notes);
    setNotes("");
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setNotes("");
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setNotes("");
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      style={{ pointerEvents: "all" }}
      onClick={handleBackdrop}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className="relative bg-background border rounded-2xl max-w-[92vw] sm:max-w-md w-full p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col space-y-1.5 text-left">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Wrench className="w-5 h-5 text-amber-500" /> Parts Needed
          </h2>
          <p className="text-sm text-muted-foreground pt-1">
            What parts are required for this job?
          </p>
        </div>
        <div className="space-y-4 pt-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Thermocouple, pilot jet, flue seal..."
            className="min-h-[110px]"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
          />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-amber-500 hover:bg-amber-500/90 text-white"
              onClick={handleConfirm}
              disabled={loading || !notes.trim()}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PartsNeededSheet;
