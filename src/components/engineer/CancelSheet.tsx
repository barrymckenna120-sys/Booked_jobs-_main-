import { useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const REASONS = [
  "No access – customer not home",
  "Customer cancelled last minute",
  "Parts needed before work can start",
  "Safety concern – work stopped",
  "Wrong address / can't locate",
  "Other",
];

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (reason: string, note: string) => void;
}

const CancelSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground">✕ No Access / Cancel</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{customer.name}</div>
      </div>
      <div className="px-5 pt-4 space-y-2.5">
        <div className="text-sm text-muted-foreground mb-1">Select a reason — the office will be notified automatically.</div>
        {REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors ${
              reason === r
                ? "border-destructive bg-destructive/5 text-destructive font-bold"
                : "border-border bg-card text-foreground"
            } text-sm font-medium flex items-center justify-between`}
          >
            {r}
            {reason === r && <span>✓</span>}
          </button>
        ))}

        <div className="space-y-1.5 pt-1">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Additional note (optional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any extra detail…" />
        </div>

        <Button
          className="w-full h-12 text-base font-extrabold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          disabled={!reason}
          onClick={() => onDone(reason, note)}
        >
          ✕ Report Cancellation
        </Button>
        <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">
          Back
        </button>
      </div>
    </EngineerSheet>
  );
};

export default CancelSheet;
