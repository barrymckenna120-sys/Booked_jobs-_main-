import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, AlertTriangle, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  delivered: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "📲",
  in_app: "💬",
  email: "📧",
};

const MessageLogWidget = () => {
  const { user } = useAuth();
  const { role } = useUserRole(user);
  const navigate = useNavigate();
  const isEngineer = role === "engineer";

  const { data: entries = [] } = useQuery({
    queryKey: ["message-log-widget", user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("message_log")
        .select("id, sent_at, message_type, status, channel, customer_id, sent_by, content")
        .order("sent_at", { ascending: false })
        .limit(5);

      if (isEngineer) {
        query = query.eq("sent_by", user!.id);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!user,
  });

  // Get customer names for these entries
  const customerIds = [...new Set(entries.filter((e: any) => e.customer_id).map((e: any) => e.customer_id))];
  const { data: customers = [] } = useQuery({
    queryKey: ["message-log-widget-customers", customerIds.join(",")],
    queryFn: async () => {
      if (customerIds.length === 0) return [];
      const { data } = await supabase.from("customers").select("id, name").in("id", customerIds);
      return data || [];
    },
    enabled: customerIds.length > 0,
  });
  const customerMap = Object.fromEntries((customers as any[]).map((c: any) => [c.id, c.name]));

  // Failed count in last 7 days
  const { data: failedCount = 0 } = useQuery({
    queryKey: ["message-log-failed-count", user?.id, role],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let query = supabase
        .from("message_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("sent_at", sevenDaysAgo.toISOString());

      if (isEngineer) {
        query = query.eq("sent_by", user!.id);
      }

      const { count } = await query;
      return count || 0;
    },
    enabled: !!user,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Message Log
            {(failedCount as number) > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-extrabold">
                {failedCount as number}
              </span>
            )}
          </CardTitle>
          <button
            onClick={() => navigate("/message-log")}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry: any) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => navigate("/message-log")}
              >
                <span className="text-base flex-shrink-0">{CHANNEL_ICON[entry.channel] || "📨"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {customerMap[entry.customer_id] || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{entry.message_type}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {entry.sent_at ? formatDistanceToNow(new Date(entry.sent_at), { addSuffix: true }) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {entry.status === "failed" && <AlertTriangle className="w-3 h-3 text-destructive" />}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[entry.status] || STATUS_STYLE.pending}`}>
                    {entry.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessageLogWidget;
