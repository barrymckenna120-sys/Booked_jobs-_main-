import { useState, useEffect } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (method: string, confirmedAmount: number) => void;
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

const PaymentSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [amount, setAmount] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
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
  }, [job?.revenue, job?.job_type]);

  const handleConfirm = () => {
    if (!selected) return;
    onDone(selected, parseFloat(amount) || 0);
  };

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
          <Label htmlFor="job-total" className="text-sm font-bold text-foreground">Job Total (€)</Label>
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
          <p className="text-[11px] text-muted-foreground">Pre-filled from job price or default. Edit if needed.</p>
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
