import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

const PRESETS = [
  "Running late – 30 mins",
  "Running late – 1 hour",
  "Change of plan – call office",
  "Job rescheduled",
  "Customer not home – call them",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  engineerName: string;
  engineerAuthUserId: string | null;
}

const MessageEngineerModal = ({ open, onOpenChange, jobId, engineerName, engineerAuthUserId }: Props) => {
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

  const handlePreset = (text: string) => {
    setMessage(text);
    setIsPreset(true);
  };

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

      // notifications row is now inserted by the notify_on_job_message DB trigger.


      toast({ title: `Message sent to ${engineerName}` });
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
          <DialogTitle>📩 Message Engineer</DialogTitle>
          <DialogDescription>{engineerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => handlePreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  message === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <Textarea
            rows={3}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setIsPreset(false);
            }}
            placeholder="Or type a custom message…"
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

export default MessageEngineerModal;
