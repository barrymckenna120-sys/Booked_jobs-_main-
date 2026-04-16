import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Inbox, Wrench, Clock, CalendarDays, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface StatCard {
  icon: LucideIcon;
  label: string;
  count: number;
  trend: string;
  iconBg: string;
  iconColor: string;
  path: string;
}

const DashboardStatCards = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["dashboard-stat-cards", user?.id, todayStr],
    queryFn: async () => {
      const [incomingRes, customersRes, weekJobsRes] = await Promise.all([
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

      return {
        incoming: incomingRes.count || 0,
        overdue,
        dueSoon,
        incompleteWeek: weekJobsRes.count || 0,
      };
    },
    enabled: !!user,
  });

  const cards: StatCard[] = [
    {
      icon: Inbox,
      label: "New Incoming",
      count: data?.incoming || 0,
      trend: "This week",
      iconBg: "bg-warning/15",
      iconColor: "text-warning",
      path: "/jobs",
    },
  {
    icon: Wrench,
    label: "Overdue Services",
    count: data?.overdue || 0,
    trend: "Needs action",
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    path: "/pipeline?filter=overdue",
  },
  {
    icon: Clock,
    label: "Due Soon",
    count: data?.dueSoon || 0,
    trend: "Next 30 days",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    path: "/pipeline?filter=due-soon",
  },
    {
      icon: CalendarDays,
      label: "Incomplete Jobs",
      count: data?.incompleteWeek || 0,
      trend: "This week",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      path: "/jobs?filter=incomplete",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={() => navigate(card.path)}
          className="bg-card rounded-xl border border-border/60 p-4 sm:p-5 shadow-sm text-left transition-colors hover:bg-accent/50 active:bg-accent/70 cursor-pointer"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {card.trend}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            </div>
          </div>
          <p className="text-3xl sm:text-4xl font-bold font-mono text-foreground leading-none">
            {card.count}
          </p>
          <p className="text-xs font-medium text-muted-foreground mt-1.5">{card.label}</p>
        </button>
      ))}
    </div>
  );
};

export default DashboardStatCards;
