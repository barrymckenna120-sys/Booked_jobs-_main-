import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, Loader2, X, Plus, Trash2 } from "lucide-react";
import type { PartLineInput, PartPriority } from "@/lib/partsRequests";

const PRIORITIES: { value: PartPriority; label: string; emoji: string; border: string; text: string; bg: string }[] = [
  { value: "urgent", label: "Urgent", emoji: "🔴", border: "border-[#DC2626]", text: "text-[#DC2626]", bg: "bg-[#DC2626] text-white border-[#DC2626]" },
  { value: "normal", label: "Normal", emoji: "🟡", border: "border-[#D97706]", text: "text-[#D97706]", bg: "bg-[#D97706] text-white border-[#D97706]" },
  { value: "low",    label: "Low",    emoji: "🟢", border: "border-[#16A34A]", text: "text-[#16A34A]", bg: "bg-[#16A34A] text-white border-[#16A34A]" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: PartLineInput[]) => void;
  loading?: boolean;
}

const emptyLine = (): PartLineInput => ({ description: "", priority: "normal" });

const PartsNeededSheet = ({ open, onClose, onConfirm, loading }: Props) => {
  const [lines, setLines] = useState<PartLineInput[]>([emptyLine()]);

  if (!open) return null;

  const reset = () => setLines([emptyLine()]);

  const updateLine = (index: number, patch: Partial<PartLineInput>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLines((prev) => [...prev, emptyLine()]);
  };

  const removeLine = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const validLines = lines.filter((l) => l.description.trim().length > 0);

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (validLines.length === 0) return;
    onConfirm(validLines.map((l) => ({ ...l, description: l.description.trim() })));
    reset();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    reset();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      style={{ pointerEvents: "all" }}
      onClick={handleCancel}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className="relative bg-background border rounded-2xl max-w-[92vw] sm:max-w-md w-full p-6 shadow-lg max-h-[90vh] overflow-y-auto"
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
            Add each part on its own line — office can order them separately.
          </p>
        </div>

        <div className="space-y-4 pt-4">
          {lines.map((line, index) => (
            <div key={index} className="rounded-xl border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Part {index + 1}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive p-1 -m-1"
                    aria-label={`Remove part ${index + 1}`}
                    onClick={(e) => removeLine(e, index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <Textarea
                value={line.description}
                onChange={(e) => updateLine(index, { description: e.target.value })}
                placeholder="e.g. Thermocouple"
                className="min-h-[70px]"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
              />

              <div className="flex gap-2">
                {PRIORITIES.map((p) => {
                  const isSelected = line.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); updateLine(index, { priority: p.value }); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-1.5 text-xs font-semibold transition-all ${
                        isSelected ? p.bg : `${p.border} ${p.text} bg-transparent`
                      }`}
                    >
                      <span>{p.emoji}</span> {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="w-full gap-1.5" onClick={addLine}>
            <Plus className="w-4 h-4" /> Add another part
          </Button>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 bg-amber-500 hover:bg-amber-500/90 text-white"
              onClick={handleConfirm}
              disabled={loading || validLines.length === 0}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm{validLines.length > 1 ? ` (${validLines.length})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PartsNeededSheet;
