import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageCircle, Filter, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Customer = {
  id: string;
  name: string;
  phone: string;
  eircode: string;
  next_service_due: string | null;
};

type Props = {
  customers: Customer[];
  userId: string | undefined;
  onRemindersSent: () => void;
};

const SendServiceReminders = ({ customers, userId, onRemindersSent }: Props) => {
  const { toast } = useToast();
  const currentMonth = new Date().getMonth();
  const [postcodeFilter, setPostcodeFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(String(currentMonth));
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedMonthIndex = parseInt(monthFilter);
  const selectedMonthName = MONTHS[selectedMonthIndex];

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (!c.next_service_due) return false;

      // Month filter
      const dueDate = new Date(c.next_service_due + "T00:00:00");
      if (dueDate.getMonth() !== selectedMonthIndex) return false;

      // Postcode filter
      if (postcodeFilter.trim()) {
        const q = postcodeFilter.trim().toLowerCase();
        if (!c.eircode.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [customers, selectedMonthIndex, postcodeFilter]);

  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("0")) cleaned = "353" + cleaned.slice(1);
    if (!cleaned.startsWith("+") && !cleaned.startsWith("353")) cleaned = "353" + cleaned;
    return cleaned.replace("+", "");
  };

  const handleConfirmSend = async () => {
    if (!userId) return;
    setSending(true);

    let sentCount = 0;

    for (const customer of filtered) {
      const firstName = customer.name.split(" ")[0];
      const message = `Hi ${firstName}, your boiler service is due this month, book a time and day here: BOOKING_LINK_HERE Karl's Gas Services`;
      const formattedPhone = formatPhoneForWhatsApp(customer.phone);

      // Log to message_log
      await supabase.from("message_log").insert({
        customer_id: customer.id,
        message_type: "service_reminder",
        channel: "whatsapp",
        direction: "outbound",
        content: message,
        status: "sent",
        related_type: "renewal",
        sent_by: userId,
        sent_at: new Date().toISOString(),
      } as any);

      // Update customer reminder status
      await supabase.from("customers").update({
        last_reminder_sent: new Date().toISOString(),
        reminder_30_days_sent: true,
        renewal_stage: "reminded",
      } as any).eq("id", customer.id);

      // Log to whatsapp_messages
      await supabase.from("whatsapp_messages").insert({
        user_id: userId,
        customer_id: customer.id,
        message_type: "Service Reminder",
        message_body: message,
        sent_by: "office",
        status: "Sent",
      } as any);

      // Open WhatsApp link
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, "_blank");

      sentCount++;

      // Small delay between opens to avoid browser blocking
      if (sentCount < filtered.length) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    setSending(false);
    setShowConfirm(false);

    toast({ title: `WhatsApp sent to ${sentCount} customers` });
    onRemindersSent();
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        Send Service Reminders
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
          <Input
            placeholder="Filter by postcode e.g. D18"
            value={postcodeFilter}
            onChange={(e) => setPostcodeFilter(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length > 0 && (
        <Button
          className="w-full h-12 text-sm font-extrabold gap-2"
          style={{ backgroundColor: "#4A86E8" }}
          onClick={() => setShowConfirm(true)}
        >
          <MessageCircle className="w-4 h-4" />
          Send WhatsApp to {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
        </Button>
      )}

      {postcodeFilter.trim() && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No customers match "{postcodeFilter}" in {selectedMonthName}
        </p>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Service Reminders</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to send {filtered.length} WhatsApp message{filtered.length !== 1 ? "s" : ""} to customers with services due in {selectedMonthName}. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSend}
              disabled={sending}
              style={{ backgroundColor: "#4A86E8" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {sending ? "Sending..." : "Confirm & Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SendServiceReminders;
