import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ban, Loader2 } from "lucide-react";

const REASONS = [
  "Customer not home",
  "Wrong address",
  "Access blocked",
  "Other",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
  loading?: boolean;
}

const NoShowSheet = ({ open, onClose, onConfirm, loading }: Props) => {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm(reason || "Customer not home", notes);
    setReason("");
    setNotes("");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-destructive" /> Could Not Gain Access
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes (optional)</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm No Show
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NoShowSheet;
