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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto px-1">
      {messages.map((m) => {
        const isMe = m.sender_role === perspective;
        return (
          <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                isMe
                  ? "bg-[#4A86E8] text-white rounded-br-sm"
                  : "bg-[#F3F4F6] text-foreground rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.message}</p>
              <p className={`text-[10px] mt-1 ${isMe ? "text-white/60" : "text-muted-foreground/60"}`}>
                {m.sender_role === "office" ? "Office" : "Engineer"} · {format(parseISO(m.created_at), "HH:mm")}
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
