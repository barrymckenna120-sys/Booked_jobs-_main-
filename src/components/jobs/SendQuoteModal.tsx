import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Quote = {
  id: string;
  description: string;
  total_amount: number;
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
  onClose: () => void;
  onSent: () => void;
};

const SendQuoteModal = ({ mode, quote, customer, onClose, onSent }: Props) => {
  const quoteLink = `${window.location.origin}/quote/${quote.id}`;
  const paymentLine = quote.payment_link
    ? `\n\nPay ${quote.deposit_amount ? `deposit of €${quote.deposit_amount}` : "now"}: ${quote.payment_link}`
    : "";

  const defaultMessage = `Hi ${customer.name},

Here is your quote for: ${quote.description}

Total: €${Number(quote.total_amount).toFixed(2)}

You can view and approve your quote here:
${quoteLink}${paymentLine}

Any questions, call us anytime.
Karl's Gas 🔥`;

  const [message, setMessage] = useState(defaultMessage);
  const [emailTo, setEmailTo] = useState(customer.email || "");
  const [emailSubject, setEmailSubject] = useState(`Your Quote from Karl's Gas — €${Number(quote.total_amount).toFixed(2)}`);

  const handleSend = () => {
    if (mode === "whatsapp") {
      const phone = customer.phone.replace(/\D/g, "");
      const fullPhone = phone.startsWith("353") ? phone : phone.startsWith("0") ? "353" + phone.slice(1) : "353" + phone;
      const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank");
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
            <Label className="text-xs font-semibold">Message</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[200px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length} characters</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSend}>
              {mode === "whatsapp" ? "📲 Open WhatsApp" : "📧 Send Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendQuoteModal;
