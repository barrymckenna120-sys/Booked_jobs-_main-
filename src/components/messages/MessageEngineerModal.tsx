import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, X } from "lucide-react";

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
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [sending, setSending] = useState(false);

  const handlePreset = (text: string) => {
    setMessage(text);
    setIsPreset(true);
  };

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    try {
      // Insert message
      const { error } = await supabase.from("job_messages").insert({
        job_id: jobId,
        sender_role: "office",
        sender_id: user.id,
        message: message.trim(),
        is_preset: isPreset,
      } as any);
      if (error) throw error;

      // Insert notification for engineer
      if (engineerAuthUserId) {
        await supabase.from("notifications").insert({
          recipient_user_id: engineerAuthUserId,
          notification_type: "message",
          title: "Message from Office",
          body: message.trim(),
          job_id: jobId,
          role: "engineer",
        } as any);
      }

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
          <p className="text-sm text-muted-foreground">{engineerName}</p>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => handlePreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  message === p
                    ? "bg-[#4A86E8] text-white border-[#4A86E8]"
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
            style={{ backgroundColor: "#4A86E8" }}
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
