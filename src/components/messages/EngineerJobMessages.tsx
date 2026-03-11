import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";
import JobMessageThread from "./JobMessageThread";

const PRESETS = [
  "On my way",
  "Running late – 30 mins",
  "Running late – 1 hour",
  "Arrived on site",
  "Job complete",
];

interface Props {
  jobId: string;
  officeUserId: string;
}

const EngineerJobMessages = ({ jobId, officeUserId }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("job_messages").insert({
        job_id: jobId,
        sender_role: "engineer",
        sender_id: user.id,
        message: message.trim(),
        is_preset: isPreset,
      } as any);
      if (error) throw error;

      // Notify office
      if (officeUserId) {
        await supabase.from("notifications").insert({
          recipient_user_id: officeUserId,
          notification_type: "message",
          title: "Message from Engineer",
          body: message.trim(),
          job_id: jobId,
          role: "office",
        } as any);
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
    <div className="mt-3 bg-muted/30 rounded-xl p-3 space-y-2">
      <div className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider mb-1">Messages</div>

      <JobMessageThread jobId={jobId} perspective="engineer" />

      {/* Preset chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setMessage(p);
              setIsPreset(true);
            }}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 transition-colors ${
              message === p
                ? "bg-[#4A86E8] text-white border-[#4A86E8]"
                : "bg-card text-muted-foreground border-border"
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
          onChange={(e) => {
            setMessage(e.target.value);
            setIsPreset(false);
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40 shrink-0"
          style={{ backgroundColor: "#4A86E8" }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default EngineerJobMessages;
