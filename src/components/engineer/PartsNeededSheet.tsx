import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, Loader2, X } from "lucide-react";

type Priority = "urgent" | "normal" | "low";

const PRIORITIES: { value: Priority; label: string; emoji: string; border: string; text: string; bg: string }[] = [
  { value: "urgent", label: "Urgent", emoji: "🔴", border: "border-[#DC2626]", text: "text-[#DC2626]", bg: "bg-[#DC2626] text-white border-[#DC2626]" },
  { value: "normal", label: "Normal", emoji: "🟡", border: "border-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706] text-white border-[#D97706]" },
  { value: "low",    label: "Low",    emoji: "🟢", border: "border-[#16A34A]", text: "text-[#16A34A]", bg: "bg-[#16A34A] text-white border-[#16A34A]" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string, priority: Priority) => void;
  loading?: boolean;
}

const PartsNeededSheet = ({ open, onClose, onConfirm, loading }: Props) => {
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  if (!open) return null;

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onConfirm(notes, priority);
    setNotes("");
    setPriority("normal");
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setNotes("");
    setPriority("normal");
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setNotes("");
    setPriority("normal");
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

          {/* Priority selector */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Priority</p>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPriority(p.value); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border-2 px-3 py-2 text-xs font-semibold transition-all ${
                      isSelected ? p.bg : `${p.border} ${p.text} bg-transparent`
                    }`}
                  >
                    <span>{p.emoji}</span> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

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
