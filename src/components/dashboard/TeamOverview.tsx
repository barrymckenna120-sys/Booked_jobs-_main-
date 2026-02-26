import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Car, MapPin, Wrench, CheckCircle2, Coffee, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";

const STATUS_ICON: Record<string, { Icon: LucideIcon; color: string; label: string }> = {
  "En Route":    { Icon: Car,          color: "text-warning",     label: "En Route" },
  "On Site":     { Icon: MapPin,       color: "text-warning",     label: "On Site" },
  "In Progress": { Icon: Wrench,       color: "text-warning",     label: "Working" },
};

const TeamOverview = () => {
  const { user } = useAuth();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: engineers = [], isLoading: loadingEngineers } = useQuery({
    queryKey: ["dashboard-team-engineers", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("engineers")
        .select("id, name, status, is_available")
        .eq("status", "active")
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const { data: todayJobs = [] } = useQuery({
    queryKey: ["dashboard-team-jobs", user?.id, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("assigned_engineer, assigned_engineer_id, status")
        .eq("scheduled_date", todayStr);
      return data || [];
    },
    enabled: !!user,
  });

  const engineerStats = engineers.map((eng: any) => {
    const myJobs = todayJobs.filter((j: any) => j.assigned_engineer_id === eng.id || j.assigned_engineer === eng.name);
    const activeJob = myJobs.find((j: any) => ["En Route", "On Site", "In Progress"].includes(j.status));
    const completedCount = myJobs.filter((j: any) => j.status === "Completed").length;
    const totalCount = myJobs.length;

    return { ...eng, activeJob, completedCount, totalCount };
  });

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Team</h3>
          <span className="text-xs text-muted-foreground/60">{engineers.length} engineer{engineers.length !== 1 ? "s" : ""}</span>
        </div>

        {loadingEngineers ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : engineers.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 text-center py-8">No engineers set up yet</p>
        ) : (
          <div className="space-y-3">
            {engineerStats.map((eng: any) => {
              const statusInfo = eng.activeJob ? STATUS_ICON[eng.activeJob.status] : null;
              const StatusIcon = statusInfo?.Icon || Coffee;
              const statusColor = statusInfo?.color || "text-muted-foreground/50";
              const statusLabel = statusInfo?.label || (eng.totalCount === 0 ? "No jobs" : eng.completedCount === eng.totalCount ? "All done" : "Available");

              return (
                <div key={eng.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{eng.name?.[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{eng.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <StatusIcon className={`w-3 h-3 ${statusColor}`} />
                      <span className={`text-[11px] font-semibold ${statusColor}`}>{statusLabel}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-foreground">{eng.completedCount}/{eng.totalCount}</div>
                    <div className="text-[10px] text-muted-foreground/60">jobs done</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamOverview;