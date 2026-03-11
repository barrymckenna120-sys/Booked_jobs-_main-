import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { Loader2, MessageCircle } from "lucide-react";

interface Conversation {
  job_id: string;
  engineer_name: string;
  customer_name: string;
  job_type: string;
  scheduled_date: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

const Messages = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!user) return;

    // Get all job messages for jobs belonging to this user
    const { data: messages } = await supabase
      .from("job_messages")
      .select("*")
      .order("created_at", { ascending: false }) as any;

    if (!messages || messages.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Group by job_id
    const jobMap = new Map<string, any[]>();
    messages.forEach((m: any) => {
      if (!jobMap.has(m.job_id)) jobMap.set(m.job_id, []);
      jobMap.get(m.job_id)!.push(m);
    });

    const jobIds = Array.from(jobMap.keys());

    // Fetch job + customer info
    const { data: jobs } = await supabase
      .from("service_calls")
      .select("id, customer_id, job_type, scheduled_date, assigned_engineer, assigned_engineer_id")
      .in("id", jobIds);

    if (!jobs) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const customerIds = [...new Set(jobs.map((j) => j.customer_id))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);

    const customerMap = new Map((customers || []).map((c) => [c.id, c.name]));

    const convos: Conversation[] = jobs.map((j) => {
      const msgs = jobMap.get(j.id) || [];
      const lastMsg = msgs[0]; // already sorted desc
      const unread = msgs.filter((m: any) => m.sender_role === "engineer" && !m.read_at).length;

      return {
        job_id: j.id,
        engineer_name: j.assigned_engineer || "Unassigned",
        customer_name: customerMap.get(j.customer_id) || "Unknown",
        job_type: j.job_type,
        scheduled_date: j.scheduled_date,
        last_message: lastMsg?.message || "",
        last_message_at: lastMsg?.created_at || "",
        unread_count: unread,
      };
    });

    convos.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    setConversations(convos);
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("messages-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_messages" }, () => {
        fetchConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);
  const jobsWithUnread = conversations.filter((c) => c.unread_count > 0).length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">💬 Messages</h1>

      {totalUnread > 0 && (
        <div className="text-sm text-muted-foreground mb-4">
          {totalUnread} unread message{totalUnread !== 1 ? "s" : ""} across {jobsWithUnread} job{jobsWithUnread !== 1 ? "s" : ""}
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No messages yet. Messages from engineers will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.job_id}
              onClick={() => navigate(`/jobs/${c.job_id}`)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-[#4A86E8]/15 text-[#4A86E8] font-bold text-sm flex items-center justify-center shrink-0">
                {c.engineer_name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm truncate">{c.engineer_name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                    {c.last_message_at ? format(parseISO(c.last_message_at), "HH:mm") : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.customer_name} · {c.job_type}
                  {c.scheduled_date ? ` · ${format(parseISO(c.scheduled_date), "dd MMM")}` : ""}
                </div>
                <div className="text-xs text-muted-foreground/60 truncate mt-0.5">
                  {c.last_message.substring(0, 50)}{c.last_message.length > 50 ? "…" : ""}
                </div>
              </div>

              {c.unread_count > 0 && (
                <span className="bg-[#4A86E8] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
                  {c.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Messages;
