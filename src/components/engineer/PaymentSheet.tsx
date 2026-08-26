import { useState, useEffect } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolvePaymentSheetState, LABEL_JOB_TOTAL } from "@/lib/paymentSheetAmount";
import JobFullyPaidPanel from "@/components/payments/JobFullyPaidPanel";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (method: string, confirmedAmount: number) => void | Promise<void>;
  /** Fully-paid jobs only: mark complete without touching any payment field. */
  onCompleteOnly?: () => void;
  /** Failure message shown inline; sheet stays open with entered data intact. */
  errorMessage?: string | null;
  /**
   * Set when the authoritative pre-write re-read found the job already settled
   * (BJ-next-D) — the in-memory job was stale, so force the fully-paid state.
   */
  forceFullyPaid?: boolean;
}



const DEFAULT_PRICES: Record<string, string> = {
  "Boiler Service": "default_service_price",
  "Emergency": "default_emergency_price",
  "Repair": "default_repair_price",
};

const METHODS = [
  { key: "cash", label: "Cash", icon: Banknote, emoji: "💵" },
  { key: "card", label: "Card", icon: CreditCard, emoji: "💳" },
  { key: "invoice", label: "Invoice", icon: FileText, emoji: "📄" },
];

const euro = (n: number) => `€${Number(n || 0).toFixed(2)}`;

const PaymentSheet = ({ job, customer, onClose, onDone, onCompleteOnly, errorMessage }: Props) => {
  const [amount, setAmount] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);

  const state = resolvePaymentSheetState(job);
  const isFullyPaid = state.case === "B";

  useEffect(() => {
    if (isFullyPaid) {
      setAmount("");
      return;
    }

    // Cases A and D have an explicit amount to collect.
    if (state.case === "A" || state.case === "D") {
      if (state.amount !== undefined) {
        setAmount(String(state.amount));
        return;
      }
    }

    // Case C — unchanged behaviour: job revenue, else settings default by job type.
    const rev = job?.revenue;
    if (rev && Number(rev) > 0) {
      setAmount(String(Number(rev)));
      return;
    }

    const settingsCol = DEFAULT_PRICES[job?.job_type];
    if (!settingsCol) {
      setAmount("");
      return;
    }

    supabase
      .from("settings")
      .select(settingsCol)
      .limit(1)
      .single()
      .then(({ data }) => {
        const val = data?.[settingsCol as keyof typeof data];
        if (val && Number(val) > 0) {
          setAmount(String(Number(val)));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.revenue, job?.job_type, state.case, state.amount, isFullyPaid]);

  const handleConfirm = () => {
    // Server-side guard: never submit a payment on an already settled job.
    if (isFullyPaid) return;
    if (!selected) return;
    onDone(selected, parseFloat(amount) || 0);
  };

  if (isFullyPaid) {
    const collected = state.jobTotal > 0 ? state.jobTotal : state.depositAmount;
    return (
      <EngineerSheet onClose={onClose}>
        <div className="px-5 py-3 border-b border-border">
          <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" /> Payment Complete
          </div>
          <div className="text-[13px] text-muted-foreground mt-0.5">{customer?.name}</div>
        </div>
        <div className="px-5 pt-4 space-y-4">
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 space-y-1">
            <div className="text-sm font-extrabold text-foreground">This job is fully paid</div>
            <div className="text-[13px] text-muted-foreground">
              No further payment can be collected here.
            </div>
            {collected > 0 && (
              <div className="flex justify-between pt-2 text-sm">
                <span className="text-muted-foreground">Amount already collected</span>
                <span className="font-extrabold text-foreground">{euro(collected)}</span>
              </div>
            )}
          </div>
          {onCompleteOnly && (
            <Button
              className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2"
              onClick={onCompleteOnly}
            >
              <CheckCircle2 className="w-5 h-5" /> Complete Job
            </Button>
          )}
          <Button className="w-full h-12 text-base font-extrabold" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </EngineerSheet>
    );
  }

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <Banknote className="w-5 h-5 text-success" /> Confirm Job Total
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {customer.name} · Confirm the amount and payment method
        </div>
      </div>
      <div className="px-5 pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="job-total" className="text-sm font-bold text-foreground">
            {state.label ?? LABEL_JOB_TOTAL}
          </Label>
          <Input
            id="job-total"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-lg font-bold h-12"
          />
          {state.case === "A" ? (
            <p className="text-[11px] text-muted-foreground">
              Deposit of {euro(state.depositAmount)} already collected · Job total {euro(state.jobTotal)}.
            </p>
          ) : state.case === "D" ? (
            <p className="text-[11px] text-muted-foreground">
              Deposit only · Job total {euro(state.jobTotal)}.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Pre-filled from job price or default. Edit if needed.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Method</Label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => {
              const isSelected = selected === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelected(m.key)}
                  className={`min-h-[56px] rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-sm font-bold transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="text-lg">{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[13px] font-semibold text-destructive">
            {errorMessage}
          </div>
        )}

        <Button
          className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2"
          disabled={!selected}
          onClick={handleConfirm}
        >
          <CheckCircle2 className="w-5 h-5" /> Confirm & Complete
        </Button>
        <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">
          Cancel
        </button>
      </div>
    </EngineerSheet>
  );
};

export default PaymentSheet;
