import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type Customer = {
  id: string;
  name: string;
  phone: string;
  next_service_due: string | null;
};

type Props = {
  customer: Customer;
  defaultType?: string;
  settings?: { reminder_message_template: string | null; whatsapp_number: string | null; business_name: string } | null;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
};

const MESSAGE_TYPES = ["30 Day Reminder", "7 Day Reminder", "Custom"] as const;

const SendReminderModal = ({ customer, defaultType = "30 Day Reminder", settings, open, onClose, onSent }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageType, setMessageType] = useState(defaultType);
  const [messageBody, setMessageBody] = useState("");

  useEffect(() => {
    const template = settings?.reminder_message_template ||
      "Hi {customer_name},\n\nYour annual boiler service is due on {date}.\n\nTo book your service, reply YES or call us on {phone}.\n\nKarl's Gas 🔥";
    const filled = template
      .replace("{customer_name}", customer.name.split(" ")[0])
      .replace("{date}", customer.next_service_due ? new Date(customer.next_service_due).toLocaleDateString("en-IE") : "soon")
      .replace("{phone}", settings?.whatsapp_number || "");
    setMessageBody(filled);
  }, [customer, settings, messageType]);

  const handleSend = async () => {
    if (!user) return;
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageBody)}`;
    window.open(waUrl, "_blank");

    // Log message
    await supabase.from("whatsapp_messages").insert({
      user_id: user.id,
      customer_id: customer.id,
      message_type: messageType,
      message_body: messageBody,
      sent_by: user.email,
      status: "Sent",
    } as any);

    // Update customer tracking
    const updates: Record<string, any> = {
      last_message_sent_at: new Date().toISOString(),
      last_message_type: messageType,
    };
    if (messageType === "30 Day Reminder") updates.reminder_30_days_sent = true;
    if (messageType === "7 Day Reminder") updates.reminder_7_days_sent = true;
    await supabase.from("customers").update(updates).eq("id", customer.id);

    toast({ title: `Message logged for ${customer.name}` });
    onSent();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Send WhatsApp Reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="font-semibold">{customer.name}</p>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
          </div>

          <div className="flex gap-2">
            {MESSAGE_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setMessageType(t)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  messageType === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Message</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[120px]"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={5}
            />
            <p className={`text-xs ${messageBody.length > 320 ? "text-warning" : "text-muted-foreground"}`}>
              {messageBody.length} / 320 characters
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSend}>📲 Open WhatsApp</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendReminderModal;
