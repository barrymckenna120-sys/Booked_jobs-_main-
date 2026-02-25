import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, startOfWeek, isToday, isTomorrow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronRight } from "lucide-react";

const jobTypeBadge = (type: string) => {
  switch (type) {
    case "Repair":
      return <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px] px-1.5 py-0">Repair</Badge>;
    case "Emergency":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">Emergency</Badge>;
    default:
      return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">Service</Badge>;
  }
};

const dayLabel = (date: Date) => {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE");
};

const WeekSnapshot = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const startStr = format(days[0], "yyyy-MM-dd");
  const endStr = format(days[6], "yyyy-MM-dd");

  const { data: jobs = [] } = useQuery({
    queryKey: ["dashboard-week-snapshot", user?.id, startStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, job_type, status, scheduled_date, time_block, assigned_engineer, revenue, customers!inner(name)")
        .gte("scheduled_date", startStr)
        .lte("scheduled_date", endStr)
        .not("status", "in", "(Completed,Cancelled)");
      return data || [];
    },
    enabled: !!user,
  });

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of days) {
      map[format(d, "yyyy-MM-dd")] = [];
    }
    for (const j of jobs) {
      if (j.scheduled_date && map[j.scheduled_date]) {
        map[j.scheduled_date].push(j);
      }
    }
    return map;
  }, [jobs, days]);

  const totalJobs = jobs.length;
  const totalRevenue = jobs.reduce((sum, j: any) => sum + (j.revenue || 0), 0);

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase">This Week</p>
            <span className="text-xs text-muted-foreground">
              {totalJobs} job{totalJobs !== 1 ? "s" : ""} • €{totalRevenue.toLocaleString()}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/schedule")}>
            View Schedule <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </Button>
        </div>

        {/* Day columns */}
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayJobs = byDay[dateStr] || [];
            const today = isToday(day);

            return (
              <div
                key={dateStr}
                className={`rounded-lg border p-2 min-h-[72px] transition-colors ${
                  today ? "border-primary/40 bg-primary/5" : "border-border"
                }`}
              >
                <div className={`text-[10px] font-semibold mb-1 ${today ? "text-primary" : "text-muted-foreground"}`}>
                  {dayLabel(day)}
                  <span className="ml-1 font-normal">{format(day, "d")}</span>
                </div>

                {dayJobs.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/50">—</p>
                ) : (
                  <div className="space-y-1">
                    {dayJobs.slice(0, 3).map((j: any) => (
                      <div key={j.id} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          j.job_type === "Emergency" ? "bg-destructive" : j.job_type === "Repair" ? "bg-warning" : "bg-primary"
                        }`} />
                        <span className="text-[10px] truncate">{(j as any).customers?.name}</span>
                      </div>
                    ))}
                    {dayJobs.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{dayJobs.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default WeekSnapshot;
