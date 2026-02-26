import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Activity } from "lucide-react";

const STATUS_META: Record<string, { icon: string; verb: string }> = {
  "En Route":    { icon: "🚗", verb: "En Route" },
  "On Site":     { icon: "📍", verb: "On Site" },
  "In Progress": { icon: "⚙️", verb: "In Progress" },
  "Completed":   { icon: "✅", verb: "Completed" },
  "Cancelled":   { icon: "❌", verb: "Cancelled" },
  "Booked":      { icon: "📅", verb: "Booked" },
  "Scheduled":   { icon: "📋", verb: "Scheduled" },
};

const LiveActivityFeed = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: activities = [] } = useQuery({
    queryKey: ["live-activity-feed", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, status, updated_at, assigned_engineer, customers!inner(name)")
        .order("updated_at", { ascending: false })
        .limit(5);
      return (data || []).map((j: any) => ({
        id: j.id,
        status: j.status,
        updatedAt: j.updated_at,
        engineer: j.assigned_engineer,
        customerName: j.customers?.name || "Unknown",
      }));
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Realtime refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("activity-feed-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["live-activity-feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  if (activities.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase">Live Activity</p>
        </div>
        <div className="space-y-2">
          {activities.map((a: any) => {
            const meta = STATUS_META[a.status] || { icon: "🔄", verb: a.status };
            const time = (() => {
              try { return format(new Date(a.updatedAt), "h:mma").toLowerCase(); }
              catch { return ""; }
            })();
            return (
              <div key={a.id} className="flex items-center gap-2.5 text-sm">
                <span className="text-base shrink-0">{meta.icon}</span>
                <span className="truncate">
                  <span className="font-semibold">{a.customerName}</span>
                  <span className="text-muted-foreground"> → {meta.verb}</span>
                </span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">{time}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
