import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

const PRESETS = [
  "Running late – 30 mins",
  "Running late – 1 hour",
  "Change of plan – call office",
  "Job rescheduled",
  "Customer not home – call them",
];

interface Props {
  jobId: string;
  engineerAuthUserId: string | null;
}

const InlineOfficeReply = ({ jobId, engineerAuthUserId }: Props) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [sending, setSending] = useState(false);
  const [senderName, setSenderName] = useState("Office");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setSenderName(data.display_name);
      });
  }, [user]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("job_messages").insert({
        organisation_id: orgId!,
        job_id: jobId,
        sender_role: "office",
        sender_id: user.id,
        message: message.trim(),
        is_preset: isPreset,
      } as any);
      if (error) throw error;

      if (engineerAuthUserId) {
        const { data: jobInfo } = await supabase
          .from("service_calls")
          .select("job_reference, customers(name)")
          .eq("id", jobId)
          .maybeSingle();
        const fullName = (jobInfo as any)?.customers?.name || "Customer";
        const invoiceNumber = (jobInfo as any)?.job_reference || "";
        const notifTitle = `New message – ${fullName} (${invoiceNumber})`;
        // notifications row is now inserted by the notify_on_job_message DB trigger.


        // Send FCM push notification
        supabase.functions.invoke("send-push-notification", {
          body: {
            recipient_user_id: engineerAuthUserId,
            title: notifTitle,
            body: message.trim(),
            job_id: jobId,
          },
        }).catch(() => {/* non-critical */});
      }

      setMessage("");
      setIsPreset(false);
    } catch (err: any) {
      toast({ title: "Error sending message", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Preset chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => { setMessage(p); setIsPreset(true); }}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 transition-colors ${
              message === p
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <input
          type="text"
          value={message}
          onChange={(e) => { setMessage(e.target.value); setIsPreset(false); }}
          placeholder="Type a message to engineer…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#4A86E8] text-white disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default InlineOfficeReply;
