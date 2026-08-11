import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveConfirmTarget, businessToday } from "@/lib/confirmReplyTarget";

type Message = {
  id: string;
  customer_id: string;
  message_body: string;
  sent_at: string;
  customer_name?: string;
};

type Props = {
  message: Message;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_OPTIONS = [
  { value: "Confirmed", label: "✅ Confirmed" },
  { value: "No Response", label: "⏳ No Response" },
  { value: "Opted Out", label: "🚫 Opted Out" },
];

const LogReplyModal = ({ message, open, onClose, onSaved }: Props) => {
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("Confirmed");

  const handleSave = async () => {
    await supabase.from("whatsapp_messages").update({
      customer_reply: reply || null,
      reply_received_at: new Date().toISOString(),
      status,
    } as any).eq("id", message.id);

    let confirmNote = "";

    if (status === "Confirmed") {
      await supabase.from("customers").update({ last_reminder_response: "Confirmed" } as any).eq("id", message.customer_id);

      // Mirror the automated WhatsApp CONFIRM path: mark the job itself
      // confirmed so the Confirmed badge shows for manual logs too.
      const { data: candidates } = await supabase
        .from("service_calls")
        .select("*")
        .eq("customer_id", message.customer_id);

      const decision = resolveConfirmTarget(
        (candidates || []).map((j: any) => ({
          id: j.id,
          scheduled_date: j.scheduled_date,
          status: j.status,
          reminder_2day_sent: j.reminder_2day_sent,
        })),
        businessToday()
      );

      if (decision.action === "act") {
        const job = (candidates || []).find((j: any) => j.id === decision.job.id) as any;
        const { error: confirmErr } = await supabase
          .from("service_calls")
          .update({ confirmed: true, confirmed_at: new Date().toISOString() } as any)
          .eq("id", decision.job.id);

        if (confirmErr) {
          confirmNote = " · couldn't mark the appointment confirmed";
        } else {
          confirmNote = " · appointment marked confirmed";
          try {
            await supabase.from("customer_activity").insert({
              organisation_id: job?.organisation_id,
              customer_id: message.customer_id,
              service_call_id: decision.job.id,
              event_type: "appointment_confirmed",
              event_label: "Appointment confirmed — logged by office",
            } as any);
          } catch { /* non-critical */ }
        }
      } else if (decision.action === "ambiguous") {
        // Never guess between multiple upcoming appointments.
        confirmNote = " · more than one upcoming appointment, please confirm on the job";
      } else {
        confirmNote = " · no upcoming appointment found to mark";
      }
    }

    if (status === "Opted Out") {
      await supabase.from("customers").update({ opted_out: true, opted_out_date: new Date().toISOString().split("T")[0] }).eq("id", message.customer_id);
    }

    toast({ title: `Reply saved${confirmNote}` });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Log Customer Reply</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {message.customer_name && <p className="font-semibold">{message.customer_name}</p>}
          <div className="bg-muted rounded-md p-3 text-sm text-muted-foreground">
            <p className="text-xs font-semibold mb-1">Original message · {new Date(message.sent_at).toLocaleDateString("en-IE")}</p>
            <p className="line-clamp-3">{message.message_body}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reply</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
              placeholder="Type what the customer replied..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  status === s.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Reply</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogReplyModal;
