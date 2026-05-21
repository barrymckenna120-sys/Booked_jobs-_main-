import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

type JobDetails = {
  id: string;
  customer_name: string;
  receipt_number: string | null;
  invoiced_at: string | null;
  balance_due: number;
  customer_phone: string | null;
  payment_status: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  job: JobDetails | null;
  onConfirm: (jobId: string) => Promise<void>;
};

const eur = (n: number) => `€${n.toFixed(2)}`;
const jobRef = (job: any) => job?.job_reference || "KN-" + (job?.id || "").substring(0, 6).toUpperCase();

const CHECKLIST_ITEMS = [
  { key: "invoice_date", label: "Invoice date is correct on this job" },
  { key: "invoice_number", label: "Invoice number is present" },
  { key: "balance_correct", label: "Balance due amount is correct (€)" },
  { key: "whatsapp_on_file", label: "Customer WhatsApp number is on file" },
  { key: "not_paid", label: "Payment status is not already marked as paid" },
] as const;

const ReminderChecklistModal = ({ open, onClose, job, onConfirm }: Props) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);

  const allChecked = CHECKLIST_ITEMS.every((item) => checked[item.key]);

  const handleToggle = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirm = async () => {
    if (!job || !allChecked) return;
    setSending(true);
    try {
      await onConfirm(job.id);
    } finally {
      setSending(false);
      setChecked({});
    }
  };

  const handleClose = () => {
    if (sending) return;
    setChecked({});
    onClose();
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Send 14-Day Reminder
          </DialogTitle>
          <DialogDescription>
            Verify the details below before sending the outstanding invoice reminder.
          </DialogDescription>
        </DialogHeader>

        {/* Job details summary */}
        <div className="rounded-lg border p-4 space-y-2 bg-muted/40">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-semibold text-foreground">{job.customer_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Job Ref</span>
            <span className="font-mono font-bold text-foreground">{jobRef(job)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice #</span>
            <span className="font-semibold text-foreground">
              {job.receipt_number || <span className="text-destructive">Missing</span>}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Invoice Date</span>
            <span className="font-semibold text-foreground">
              {job.invoiced_at
                ? new Date(job.invoiced_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Due Date</span>
            <span className="font-semibold text-foreground">
              {job.invoiced_at
                ? new Date(new Date(job.invoiced_at).getTime() + 14 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance Due</span>
            <span className="font-bold" style={{ color: "#D97706" }}>
              {eur(job.balance_due)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">WhatsApp</span>
            <span className="font-semibold text-foreground">
              {job.customer_phone || <span className="text-destructive">Not on file</span>}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payment Status</span>
            <Badge variant="outline" className="text-xs font-bold capitalize">
              {job.payment_status || "unpaid"}
            </Badge>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3 pt-2">
          <p className="text-sm font-bold text-foreground">Pre-send checklist</p>
          {CHECKLIST_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-start gap-3 cursor-pointer select-none"
            >
              <Checkbox
                checked={!!checked[item.key]}
                onCheckedChange={() => handleToggle(item.key)}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">{item.label}</span>
            </label>
          ))}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            disabled={!allChecked || sending}
            onClick={handleConfirm}
            className="gap-1.5 font-bold text-white"
            style={{ background: allChecked ? "#4A86E8" : undefined }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : (
              "Confirm & Send Reminder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReminderChecklistModal;
