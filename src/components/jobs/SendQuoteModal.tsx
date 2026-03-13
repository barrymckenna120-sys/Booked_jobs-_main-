import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Quote = {
  id: string;
  description: string;
  total_amount: number;
  parts_cost: number | null;
  labour_cost: number | null;
  payment_link: string | null;
  deposit_amount: number | null;
};

type Customer = {
  name: string;
  phone: string;
  email: string | null;
};

type Props = {
  mode: "whatsapp" | "email";
  quote: Quote;
  customer: Customer;
  businessPhone?: string;
  onClose: () => void;
  onSent: () => void;
};

const SendQuoteModal = ({ mode, quote, customer, businessPhone, onClose, onSent }: Props) => {
  const { toast } = useToast();

  const firstName = customer.name.split(" ")[0];
  const refNumber = quote.id.substring(0, 8).toUpperCase();
  const parts = Number(quote.parts_cost || 0);
  const labour = Number(quote.labour_cost || 0);
  const total = Number(quote.total_amount).toFixed(2);

  let breakdownLines = "";
  if (parts > 0) breakdownLines += `• Parts: €${parts.toFixed(2)}\n`;
  if (labour > 0) breakdownLines += `• Labour: €${labour.toFixed(2)}\n`;
  breakdownLines += `• Total: €${total}`;

  const defaultMessage = `Hi ${firstName},

Here is your quote from Karl's Gas.

Quote Ref: ${refNumber}

Job: ${quote.description}

Breakdown:
${breakdownLines}

To accept this quote, simply reply *YES* to this message.

This quote is valid for 14 days from today.

Karl's Gas${businessPhone ? `\n📞 ${businessPhone}` : ""}`;

  const [message, setMessage] = useState(defaultMessage);
  const [emailTo, setEmailTo] = useState(customer.email || "");
  const [emailSubject, setEmailSubject] = useState(`Your Quote from Karl's Gas — €${total}`);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (mode === "whatsapp") {
      setSending(true);
      try {
        const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
          body: {
            quote_id: quote.id,
            customer_name: customer.name,
            mobile_number: customer.phone,
            job_description: quote.description,
            quote_amount: Number(quote.total_amount),
            parts_cost: quote.parts_cost,
            labour_cost: quote.labour_cost,
            business_phone: businessPhone,
          },
        });
        if (error || !data?.success) {
          toast({ title: "Send failed", description: data?.error || error?.message || "Unknown error", variant: "destructive" });
          setSending(false);
          return;
        }
        toast({ title: "Quote sent via WhatsApp ✅" });
      } catch (err: any) {
        toast({ title: "Send failed", description: err.message, variant: "destructive" });
        setSending(false);
        return;
      }
      setSending(false);
    } else {
      const url = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message)}`;
      window.open(url, "_blank");
    }
    onSent();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "whatsapp" ? "Send Quote via WhatsApp" : "Send Quote via Email"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {mode === "email" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To</Label>
                <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Message Preview</Label>
            <div className="flex w-full rounded-md border border-input bg-muted px-3 py-2 text-sm min-h-[200px] font-mono whitespace-pre-wrap">
              {message}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {mode === "whatsapp" ? "📲 Send via WhatsApp" : "📧 Send Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendQuoteModal;
