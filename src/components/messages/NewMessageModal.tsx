import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";

interface Engineer {
  id: string;
  name: string;
  auth_user_id: string | null;
}

interface NewMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}

const NewMessageModal = ({ open, onOpenChange, onSent }: NewMessageModalProps) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fetchEngineers = async () => {
      const { data } = await supabase
        .from("engineers")
        .select("id, name, auth_user_id")
        .eq("status", "active")
        .order("name");
      setEngineers((data || []) as Engineer[]);
    };
    fetchEngineers();
  }, [open]);

  const handleSend = async () => {
    if (!user || !selectedEngineerId || !message.trim()) return;

    const engineer = engineers.find((e) => e.id === selectedEngineerId);
    if (!engineer?.auth_user_id) {
      toast({ title: "Error", description: "Engineer has no linked account", variant: "destructive" });
      return;
    }

    setSending(true);
    const { error } = await supabase.from("job_messages").insert({
      organisation_id: orgId!,
      job_id: null,
      sender_id: user.id,
      sender_role: "office",
      message: message.trim(),
      recipient_id: engineer.auth_user_id,
    } as any);

    if (error) {
      toast({ title: "Error sending message", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }

    toast({ title: "Message sent", description: `Sent to ${engineer.name}` });
    setMessage("");
    setSelectedEngineerId("");
    setSending(false);
    onOpenChange(false);
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">To</label>
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select engineer..." />
              </SelectTrigger>
              <SelectContent>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Message</label>
            <Textarea
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedEngineerId || !message.trim() || sending}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewMessageModal;
