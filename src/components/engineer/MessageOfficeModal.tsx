import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

const FALLBACK_PRESETS = [
  "On my way",
  "Running late – 30 mins",
  "Running late – 1 hour",
  "Arrived on site",
  "Need parts – call me",
  "Job complete",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  officeUserId: string;
}

const MessageOfficeModal = ({ open, onOpenChange, jobId, officeUserId }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [sending, setSending] = useState(false);
  const [engineerName, setEngineerName] = useState("Engineer");
  const [presets, setPresets] = useState<string[]>(FALLBACK_PRESETS);
  const [loadingPresets, setLoadingPresets] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Load engineer name
    supabase
      .from("engineers")
      .select("name, user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setEngineerName(data.name);
        // Load quick replies from admin's settings
        if (data?.user_id) {
          supabase
            .from("quick_replies")
            .select("text, sort_order")
            .eq("user_id", data.user_id)
            .order("sort_order", { ascending: true })
            .then(({ data: qr }) => {
              if (qr && qr.length > 0) {
                setPresets((qr as any[]).map((r) => r.text));
              }
              setLoadingPresets(false);
            });
        } else {
          setLoadingPresets(false);
        }
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


      toast({ title: "Message sent to office" });
      setMessage("");
      setIsPreset(false);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error sending message", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>📩 Message Office</DialogTitle>
          <DialogDescription>Send a quick update to the office</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {loadingPresets ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading quick replies…
              </div>
            ) : (
              presets.map((p) => (
                <button
                  key={p}
                  onClick={() => { setMessage(p); setIsPreset(true); }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    message === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  }`}
                >
                  {p}
                </button>
              ))
            )}
          </div>

          <Textarea
            rows={3}
            value={message}
            onChange={(e) => { setMessage(e.target.value); setIsPreset(false); }}
            placeholder="Or type a message…"
            className="text-sm"
          />

          <Button
            className="w-full h-11 font-bold gap-2"
            onClick={handleSend}
            disabled={sending || !message.trim()}
          >
            <Send className="w-4 h-4" /> Send Message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageOfficeModal;
