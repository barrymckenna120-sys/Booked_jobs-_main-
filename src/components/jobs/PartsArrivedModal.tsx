import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import { markCustomerNotified } from "@/lib/partsRequests";

type Props = {
  open: boolean;
  onClose: () => void;
  jobId: string;
  customerName: string;
  customerPhone: string;
  followUpDetail?: string | null;
  /**
   * BJ-0071 — parts this message is about. On a successful send each row is
   * stamped customer_notified_at/_by/_method = 'whatsapp', so months later the
   * record shows the customer was told rather than leaving it to memory.
   */
  partsRequestIds?: string[];
  onSent: () => void;
};

const PartsArrivedModal = ({ open, onClose, jobId, customerName, customerPhone, followUpDetail, partsRequestIds = [], onSent }: Props) => {

  const { toast } = useToast();
  const { user } = useAuth();
  const firstName = customerName.split(" ")[0];

  const { data: settings } = useQuery({
    queryKey: ["settings-footer", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("message_footer")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const messageFooter = (settings as any)?.message_footer || "K&N Gas Services";

  const defaultMessage = `Hi ${firstName}, great news — the parts for your boiler have arrived. Would you like to arrange a time to have the work completed? Please reply with a day and time that suits you.`;

  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-part-arrived", {
        body: {
          job_id: jobId,
          customer_name: customerName,
          customer_phone: customerPhone,
          follow_up_detail: followUpDetail || "Follow-up repair",
          message,
        },
      });

      if (error) {
        toast({ title: "Error sending WhatsApp", description: error.message, variant: "destructive" });
        setSending(false);
        return;
      }

      // Update job status to parts_arrived
      await supabase
        .from("service_calls")
        .update(sanitizeServiceCallUpdatePayload({ status: "parts_arrived" } as any))
        .eq("id", jobId);

      // BJ-0071 — record on the part itself that the customer was told. Office
      // roles only (DB trigger); a failure here must not lose the sent message,
      // so it warns rather than throwing.
      for (const partId of partsRequestIds) {
        const { error: notifyError } = await markCustomerNotified(partId, "whatsapp");
        if (notifyError) {
          toast({
            title: "Message sent, but not recorded on the part",
            description: notifyError.message,
            variant: "destructive",
          });
        }
      }

      toast({ title: `WhatsApp sent to ${customerName} ✅`, duration: 4000 });
      onSent();
      onClose();

    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notify Customer — Parts Arrived</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Message</Label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground italic">Footer "{messageFooter}" will be added automatically</p>
          </div>

          <p className="text-xs text-muted-foreground">{customerPhone}</p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="text-white font-bold gap-2"
              style={{ backgroundColor: "#25D366" }}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              Send via WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PartsArrivedModal;
