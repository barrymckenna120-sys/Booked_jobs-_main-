import { useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (method: string) => void;
}

const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote, description: "Customer paid cash on site" },
  { value: "card", label: "Card", icon: CreditCard, description: "Customer paid by card on site" },
  { value: "invoice", label: "Invoice", icon: FileText, description: "Send invoice to customer" },
] as const;

type Step = "select" | "no_payment";

const PaymentSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");

  const handleConfirm = () => {
    console.log("Confirm & Complete tapped, selected:", selected);
    if (!selected) {
      setStep("no_payment");
      return;
    }
    // Execute directly for all methods including invoice — no intermediate dialogs
    onDone(selected);
  };

  // Sub-screens rendered inline (no Dialog portals that fight z-index)
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
