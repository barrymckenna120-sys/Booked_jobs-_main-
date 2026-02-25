import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";

const CANCEL_REASONS = [
  "Customer Cancelled",
  "Duplicate Booking",
  "Payment Failed",
  "Engineer Unavailable",
  "No Access – Customer Not Home",
  "Parts Needed",
  "Safety Concern",
  "Other",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobRef: string;
  depositPaid?: boolean;
  onConfirm: (reason: string, note: string) => Promise<void>;
}

const CancelJobModal = ({ open, onOpenChange, jobRef, depositPaid, onConfirm }: Props) => {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(reason, note);
    setLoading(false);
    setReason("");
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Cancel Job {jobRef}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            This job will be marked as <span className="font-bold text-destructive">Cancelled</span>. It will remain in your records but be removed from the schedule and active jobs.
          </p>

          {depositPaid && (
            <div className="flex items-start gap-2 rounded-lg p-3 bg-warning/10 border-l-4 border-warning">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold">Payment has been recorded</p>
                <p className="text-xs text-muted-foreground">You may need to issue a refund separately after cancellation.</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Cancellation Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Additional Note (optional)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any extra detail…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason || loading}
              onClick={handleConfirm}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CancelJobModal;
