import { useState, useEffect } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
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

const PaymentSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [amount, setAmount] = useState<string>("");

  // Pre-fill amount from revenue or settings default
  useEffect(() => {
    const rev = job?.revenue;
    if (rev && Number(rev) > 0) {
      setAmount(String(Number(rev)));
      return;
    }

    // Fetch default price from settings
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
    if (!selected) {
      setStep("no_payment");
      return;
    }
    onDone(selected, parseFloat(amount) || 0);
  };

  if (step === "no_payment") {
    return (
      <EngineerSheet onClose={() => setStep("select")}>
        <div className="px-5 py-6 space-y-4">
          <div className="flex items-center gap-2 text-lg font-extrabold text-foreground">
            <AlertTriangle className="w-5 h-5 text-warning" /> Payment Type Required
          </div>
          <p className="text-sm text-muted-foreground">Please select Cash or Card before completing this job.</p>
          <Button className="w-full" onClick={() => setStep("select")}>Go Back</Button>
        </div>
      </EngineerSheet>
    );
  }

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <Banknote className="w-5 h-5 text-success" /> Payment Method
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">
          {customer.name} · How was this job paid?
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3">
        {/* Editable Job Total */}
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

        {METHODS.map((m) => {
          const Icon = m.icon;
          const isSelected = selected === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setSelected(m.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/30 hover:bg-muted/50"
              }`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className={`text-sm font-bold ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {m.label}
                </div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
              </div>
              {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
            </button>
          );
        })}

        <Button
          className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2 mt-2"
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
