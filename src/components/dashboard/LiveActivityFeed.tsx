import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Activity, Car, MapPin, Wrench, CheckCircle2, XCircle, CalendarDays, ClipboardList, RefreshCw, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STATUS_META: Record<string, { Icon: LucideIcon; verb: string; color: string }> = {
  "En Route":    { Icon: Car,           verb: "En Route",    color: "text-warning" },
  "On Site":     { Icon: MapPin,        verb: "On Site",     color: "text-warning" },
  "In Progress": { Icon: Wrench,        verb: "In Progress", color: "text-warning" },
  "Completed":   { Icon: CheckCircle2,  verb: "Completed",   color: "text-success" },
  "Cancelled":   { Icon: XCircle,       verb: "Cancelled",   color: "text-destructive" },
  "Booked":      { Icon: CalendarDays,  verb: "Booked",      color: "text-primary" },
  "Scheduled":   { Icon: ClipboardList, verb: "Scheduled",   color: "text-primary" },
};

const FALLBACK = { Icon: RefreshCw, verb: "Updated", color: "text-muted-foreground" };

const LiveActivityFeed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">Live Activity</p>
        </div>
        <div className="space-y-3">
          {activities.map((a: any) => {
            const meta = STATUS_META[a.status] || FALLBACK;
            const StatusIcon = meta.Icon;
            const time = (() => {
              try { return format(new Date(a.updatedAt), "h:mma").toLowerCase(); }
              catch { return ""; }
            })();
            const isClickable = !!a.id;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 py-1 rounded-md px-1 group transition-colors ${
                  isClickable ? "cursor-pointer hover:bg-primary/5" : ""
                }`}
                onClick={isClickable ? () => navigate(`/jobs/${a.id}`) : undefined}
              >
                <StatusIcon className={`w-4 h-4 shrink-0 ${meta.color}`} />
                <span className={`truncate text-sm ${isClickable ? "group-hover:text-foreground" : ""}`}>
                  <span className="font-semibold">{a.customerName}</span>
                  <span className="text-muted-foreground/70"> → {meta.verb}</span>
                </span>
                <span className="text-[11px] text-muted-foreground/60 ml-auto shrink-0">{time}</span>
                {isClickable && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
