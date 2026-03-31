import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Inbox, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

  const { data } = useQuery({
    queryKey: ["dashboard-attention", user?.id],
    queryFn: async () => {
      const [incomingRes, customersRes] = await Promise.all([
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

      return { incoming: incomingRes.count || 0, overdue, dueSoon };
    },
    enabled: !!user,
  });

  const rows: AttentionRow[] = [
    {
      icon: Inbox,
      label: "New Incoming Jobs",
      count: data?.incoming || 0,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      path: "/incoming?status=New",
    },
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
  ];

  return (
    <div className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden h-full">
      <div className="bg-warning/10 px-5 py-3 border-b border-warning/20">
        <h3 className="text-sm font-bold text-warning flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Needs Attention
        </h3>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row) => (
          <button
            key={row.label}
            onClick={() => navigate(row.path)}
            className="w-full flex items-center gap-3.5 px-5 py-4 hover:bg-secondary/50 transition-colors text-left group"
          >
            <div className={`w-9 h-9 rounded-xl ${row.iconBg} flex items-center justify-center shrink-0`}>
              <row.icon className={`w-4 h-4 ${row.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold font-mono text-foreground leading-none">{row.count}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">{row.label}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default NeedsAttentionCard;
