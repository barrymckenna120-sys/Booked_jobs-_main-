import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  message: string;
  sender_id: string | null;
  sender_role: string;
  created_at: string;
  read_at: string | null;
}

interface Props {
  recipientAuthId: string;
  engineerName: string;
  onBack: () => void;
}

const DirectMessageThread = ({ recipientAuthId, engineerName, onBack }: Props) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [senderName, setSenderName] = useState("Office");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if ((data as any)?.display_name) setSenderName((data as any).display_name);
      });
  }, [user]);

  const fetchMessages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("job_messages")
      .select("*")
      .is("job_id", null)
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${recipientAuthId}),and(sender_id.eq.${recipientAuthId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true }) as any;

    setMessages((data || []) as Message[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
  }, [user, recipientAuthId]);

  // Mark unread messages as read
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unread = messages.filter(
      (m) => m.sender_id !== user.id && !m.read_at
    );
    if (unread.length > 0) {
      supabase
        .from("job_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((m) => m.id))
        .then();
    }
  }, [messages, user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dm-${recipientAuthId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_messages" }, (payload: any) => {
        const msg = payload.new;
        if (!msg.job_id && (
          (msg.sender_id === user.id && msg.recipient_id === recipientAuthId) ||
          (msg.sender_id === recipientAuthId && msg.recipient_id === user.id)
        )) {
          setMessages((prev) => [...prev, msg as Message]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, recipientAuthId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);
    const { error } = await supabase.from("job_messages").insert({
      organisation_id: orgId!,
      job_id: null,
      sender_id: user.id,
      sender_role: "office",
      message: newMessage.trim(),
      recipient_id: recipientAuthId,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Direct messages have job_id = null, so the notify_on_job_message trigger
      // short-circuits. Insert the notification client-side for DMs only.
      await supabase.from("notifications").insert({
        organisation_id: orgId!,
        user_id: recipientAuthId,
        role: "engineer",
        type: "message",
        title: "New direct message",
        body: newMessage.trim().slice(0, 140),
      } as any);

      setNewMessage("");
    }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 font-bold text-sm flex items-center justify-center">
            {engineerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm">{engineerName}</p>
            <p className="text-[11px] text-muted-foreground">Direct Message</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-xs py-8">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const isMe = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.message}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground/60"}`}>
                      {isMe ? "You" : engineerName} · {format(parseISO(m.created_at), "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t px-4 py-3 flex gap-2 items-end">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default DirectMessageThread;
