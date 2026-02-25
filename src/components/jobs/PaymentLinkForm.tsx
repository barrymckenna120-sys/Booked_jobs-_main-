import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Props = {
  quoteId: string;
  currentLink: string | null;
  currentDeposit: number | null;
  totalAmount: number;
  onSaved: () => void;
  onCancel: () => void;
};

const PaymentLinkForm = ({ quoteId, currentLink, currentDeposit, totalAmount, onSaved, onCancel }: Props) => {
  const { toast } = useToast();
  const [link, setLink] = useState(currentLink || "");
  const [paymentType, setPaymentType] = useState<"full" | "deposit">(currentDeposit ? "deposit" : "full");
  const [depositAmount, setDepositAmount] = useState(currentDeposit?.toString() || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!link.trim()) {
      toast({ title: "Enter a payment link", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("quotes")
      .update({
        payment_link: link.trim(),
        deposit_amount: paymentType === "deposit" ? parseFloat(depositAmount) || null : null,
      } as any)
      .eq("id", quoteId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment link saved" });
      onSaved();
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Payment Link URL</Label>
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://buy.stripe.com/..." />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Deposit or Full Payment?</Label>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={paymentType === "full"} onChange={() => setPaymentType("full")} />
            Full payment €{totalAmount.toFixed(2)}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={paymentType === "deposit"} onChange={() => setPaymentType("deposit")} />
            Deposit only
          </label>
        </div>
        {paymentType === "deposit" && (
          <Input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Deposit amount" className="w-40" />
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          Save Payment Link
        </Button>
      </div>
    </div>
  );
};

export default PaymentLinkForm;
