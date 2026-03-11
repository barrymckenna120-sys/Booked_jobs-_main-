import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface Message {
  id: string;
  job_id: string;
  sender_role: string;
  sender_id: string | null;
  message: string;
  is_preset: boolean;
  read_at: string | null;
  created_at: string;
}

interface Props {
  jobId: string;
  /** Which role is "me" — flips bubble alignment */
  perspective: "office" | "engineer";
}

const JobMessageThread = ({ jobId, perspective }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resolve sender names from profiles (office) and engineers (engineer) tables
  useEffect(() => {
    if (messages.length === 0) return;

    const senderIds = [...new Set(messages.map((m) => m.sender_id).filter(Boolean))] as string[];
    const unknownIds = senderIds.filter((id) => !senderNames[id]);
    if (unknownIds.length === 0) return;

    const lookupNames = async () => {
      const newNames: Record<string, string> = {};

      // Look up in profiles (for office users)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", unknownIds);

      if (profiles) {
        for (const p of profiles) {
          if (p.display_name) newNames[p.user_id] = p.display_name;
        }
      }

      // Look up remaining in engineers (by auth_user_id)
      const stillUnknown = unknownIds.filter((id) => !newNames[id]);
      if (stillUnknown.length > 0) {
        const { data: engineers } = await supabase
          .from("engineers")
          .select("auth_user_id, name")
          .in("auth_user_id", stillUnknown);

        if (engineers) {
          for (const e of engineers) {
            if (e.auth_user_id && e.name) newNames[e.auth_user_id] = e.name;
          }
        }
      }

      if (Object.keys(newNames).length > 0) {
        setSenderNames((prev) => ({ ...prev, ...newNames }));
      }
    };

    lookupNames();
  }, [messages]);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("job_messages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as unknown as Message[]);
    };
    fetchMessages();

    const channel = supabase
      .channel(`job-messages-${jobId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_messages", filter: `job_id=eq.${jobId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as unknown as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return <p className="text-center text-muted-foreground text-xs py-4">No messages yet</p>;
  }

  const getSenderLabel = (m: Message): string => {
    if (m.sender_id && senderNames[m.sender_id]) {
      return senderNames[m.sender_id];
    }
    return m.sender_role === "office" ? "Office" : "Engineer";
  };

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto px-1">
      {messages.map((m) => {
        const isMe = m.sender_role === perspective;
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
                {getSenderLabel(m)} · {format(parseISO(m.created_at), "HH:mm")}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};

export default JobMessageThread;
