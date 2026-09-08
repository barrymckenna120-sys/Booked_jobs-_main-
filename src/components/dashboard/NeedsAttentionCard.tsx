import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Inbox, AlertTriangle, Clock, ChevronRight, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { endOfWeek, format, startOfWeek } from "date-fns";

interface AttentionRow {
  icon: LucideIcon;
  label: string;
  count: number;
  iconColor: string;
  iconBg: string;
  path: string;
}

const NeedsAttentionCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Realtime: refresh when incoming jobs change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("needs-attention-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_calls",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-attention", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const { data } = useQuery({
    queryKey: ["dashboard-attention", user?.id],
    queryFn: async () => {
      const today = new Date();
      const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [incomingRes, customersRes, incompleteRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("*", { count: "exact", head: true })
          .eq("source", "Tally Form")
          .eq("incoming_status", "Pending"),
        supabase
          .from("customers")
          .select("next_service_due, renewal_stage, is_archived")
          .not("next_service_due", "is", null)
          .eq("is_archived", false)
          .not("renewal_stage", "in", '("booked","paid")'),
        supabase
          .from("service_calls")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_date", weekStart)
          .lte("scheduled_date", weekEnd)
          .not("status", "in", '("Completed","Cancelled")'),
      ]);

      let overdue = 0;
      let dueSoon = 0;
      (customersRes.data || []).forEach((c: any) => {
        const daysUntil = Math.ceil(
          (new Date(c.next_service_due).getTime() - Date.now()) / 86400000
        );
        if (daysUntil < 0) overdue++;
        else if (daysUntil <= 30) dueSoon++;
      });

      return { incoming: incomingRes.count || 0, overdue, dueSoon, incomplete: incompleteRes.count || 0 };
    },
    enabled: !!user,
  });

  const rows: AttentionRow[] = [
    {
      icon: AlertTriangle,
      label: "Overdue Boiler Services",
      count: data?.overdue || 0,
      iconColor: "text-destructive",
      iconBg: "bg-destructive/10",
      path: "/renewals?status=Overdue",
    },
    {
      icon: Clock,
      label: "Due Soon",
      count: data?.dueSoon || 0,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      path: "/renewals?status=Due Soon",
    },
    {
      icon: CalendarClock,
      label: "Incomplete Jobs",
      count: data?.incomplete || 0,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      path: "/jobs?filter=incomplete",
    },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/80 shadow-sm overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-border/70">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          Needs Attention
        </h3>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <button
            key={row.label}
            onClick={() => navigate(row.path)}
            className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-secondary/60 transition-colors text-left group"
          >
            <div className={`w-9 h-9 rounded-lg ${row.iconBg} flex items-center justify-center shrink-0`}>
              <row.icon className={`w-4 h-4 ${row.iconColor}`} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-mono text-foreground leading-none">{row.count}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{row.label}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
        <button
          onClick={() => navigate("/incoming?status=New")}
          className="w-full flex items-center gap-3.5 px-5 py-4 bg-primary/5 hover:bg-primary/10 transition-colors text-left group"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary/80">New Incoming</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{data?.incoming || 0} job{data?.incoming === 1 ? "" : "s"} awaiting review</p>
          </div>
          <ChevronRight className="w-4 h-4 text-primary/50 group-hover:text-primary transition-colors shrink-0" />
        </button>
      </div>
    </div>
  );
};

export default NeedsAttentionCard;
