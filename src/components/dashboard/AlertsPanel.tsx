import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Inbox, Clock, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AlertItem {
  Icon: LucideIcon;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  path: string;
}

const AlertsPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["dashboard-alerts", user?.id],
    queryFn: async () => {
      const [incomingRes, customersRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("*", { count: "exact", head: true })
          .eq("source", "Tally Form")
          .eq("incoming_status", "Pending"),
        supabase
          .from("customers")
          .select("next_service_due")
          .not("next_service_due", "is", null),
      ]);

      // Compute overdue / due soon client-side to match Renewals page logic
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
      };
    },
    enabled: !!user,
  });

  const alerts: AlertItem[] = [
    {
      Icon: Inbox,
      label: "Incoming pending",
      count: data?.incoming || 0,
      color: "text-warning",
      bgColor: "bg-warning/10",
      path: "/incoming?status=New",
    },
    {
      Icon: AlertTriangle,
      label: "Overdue services",
      count: data?.overdue || 0,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      path: "/renewals?status=Overdue",
    },
    {
      Icon: Clock,
      label: "Due soon",
      count: data?.dueSoon || 0,
      color: "text-warning",
      bgColor: "bg-warning/10",
      path: "/renewals?status=Due Soon",
    },
  ].filter((a) => a.count > 0);

  if (alerts.length === 0) return null;

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h3 className="text-sm font-bold text-foreground">Needs Attention</h3>
        </div>

        <div className="space-y-3">
          {alerts.map((alert) => (
            <button
              key={alert.label}
              onClick={() => navigate(alert.path)}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-left group"
            >
              <div className={`w-9 h-9 rounded-xl ${alert.bgColor} flex items-center justify-center shrink-0`}>
                <alert.Icon className={`w-4 h-4 ${alert.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground">{alert.count}</div>
                <div className="text-[11px] text-muted-foreground/60">{alert.label}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AlertsPanel;
