import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageCircle } from "lucide-react";
import JobMessageThread from "./JobMessageThread";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";


const PRESETS = [
  "On my way",
  "Running late – 30 mins",
  "Arrived on site",
  "✅ Job complete",
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
  const [engineerName, setEngineerName] = useState("Engineer");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("engineers")
      .select("name")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setEngineerName(data.name);
      });
  }, [user]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    try {
      const { data: jobInfo } = await supabase
        .from("service_calls")
        .select("job_reference, organisation_id, customers(name)")
        .eq("id", jobId)
        .maybeSingle();
      const orgId = (jobInfo as any)?.organisation_id;

      const { error } = await supabase.from("job_messages").insert({
        organisation_id: orgId,
        job_id: jobId,
        sender_role: "engineer",
        sender_id: user.id,
        message: message.trim(),
        is_preset: isPreset,
      } as any);
      if (error) throw error;

      // Notifications are fanned out by the notify_on_job_message DB trigger.


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
      {/* Section heading matching Service History / Notes style */}
      <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "#eaecf0" }}>
        <MessageCircle className="w-4 h-4" style={{ color: "#4A86E8" }} />
        <span className="text-[15px] font-bold" style={{ color: "#1a1a2e" }}>Messages</span>
        {unreadFromOffice > 0 && (
          <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
            {unreadFromOffice > 99 ? "99+" : unreadFromOffice}
          </span>
        )}
      </div>


      <JobMessageThread jobId={jobId} perspective="engineer" />

      {/* Preset chips */}
      <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-1 scrollbar-hide">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setMessage(p);
              setIsPreset(true);
            }}
            className="whitespace-nowrap shrink-0 transition-colors"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              padding: "7px 14px",
              borderRadius: "20px",
              border: message === p ? "1.5px solid hsl(var(--primary))" : "1.5px solid #1e3a5f",
              color: message === p ? "hsl(var(--primary-foreground))" : "#1e3a5f",
              backgroundColor: message === p ? "hsl(var(--primary))" : "#f0f4f9",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div
        className="flex items-center gap-2 bg-white transition-colors focus-within:border-[#1e3a5f]"
        style={{
          border: "2px solid rgba(30,58,95,0.15)",
          borderRadius: "28px",
          boxShadow: "0 2px 8px rgba(30,58,95,0.08)",
          padding: "6px 6px 6px 16px",
        }}
      >
        <input
          type="text"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setIsPreset(false);
          }}
          placeholder="Send a message to office…"
          className="flex-1 bg-transparent text-sm focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default EngineerJobMessages;
