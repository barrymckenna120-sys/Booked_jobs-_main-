import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Phone, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";

const TIME_BLOCKS = [
  { key: "9am–11am", label: "Morning", time: "9 – 11am" },
  { key: "11am–1pm", label: "Midday", time: "11am – 1pm" },
  { key: "2pm–5pm", label: "Afternoon", time: "2 – 5pm" },
];

// Normalize legacy time_block variants to canonical form
const BLOCK_MAP: Record<string, string> = {
  "9–11": "9am–11am", "9-11": "9am–11am", "morning": "9am–11am", "Morning": "9am–11am", "9am–11am": "9am–11am",
  "11–2": "11am–1pm", "11-2": "11am–1pm", "midday": "11am–1pm", "Midday": "11am–1pm", "11am–1pm": "11am–1pm",
  "2–5": "2pm–5pm", "2-5": "2pm–5pm", "afternoon": "2pm–5pm", "Afternoon": "2pm–5pm", "2pm–5pm": "2pm–5pm",
};
const normalizeBlock = (b: string | null) => (b ? BLOCK_MAP[b] || b : null);

const STATUS_DOT: Record<string, string> = {
  Scheduled: "bg-primary",
  Booked: "bg-primary",
  "En Route": "bg-warning animate-pulse",
  "On Site": "bg-warning animate-pulse",
  "In Progress": "bg-warning animate-pulse",
  Completed: "bg-success",
  Cancelled: "bg-destructive",
};

const TodayTimeline = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["dashboard-today-timeline", user?.id, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, status, job_type, time_block, assigned_engineer, revenue, deposit_paid, customers!inner(name, address, phone)")
        .eq("scheduled_date", todayStr)
        .order("created_at");
      return data || [];
    },
    enabled: !!user,
  });

  const byBlock: Record<string, any[]> = {};
  TIME_BLOCKS.forEach((b) => { byBlock[b.key] = []; });
  jobs.forEach((j: any) => {
    const normalized = normalizeBlock(j.time_block);
    if (normalized && byBlock[normalized]) byBlock[normalized].push(j);
  });

  const activeCount = jobs.filter((j: any) => !["Completed", "Cancelled"].includes(j.status)).length;
  const completedCount = jobs.filter((j: any) => j.status === "Completed").length;

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3
              className="text-3xl font-bold text-[#4A86E8] cursor-pointer"
              onClick={() => navigate("/schedule")}
            >
              Full Schedule
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {jobs.length} job{jobs.length !== 1 ? "s" : ""} · {completedCount} done · {activeCount} remaining
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground/70">No jobs scheduled today</p>
          </div>
        ) : (
          <div className="space-y-5">
            {TIME_BLOCKS.map((block) => {
              const blockJobs = byBlock[block.key];
              if (blockJobs.length === 0) return null;

              return (
                <div key={block.key}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">{block.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{block.time}</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>

                  <div className="space-y-2">
                    {blockJobs.map((job: any) => (
                      <div
                        key={job.id}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors group"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[job.status] || "bg-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-foreground truncate">{(job as any).customers?.name}</div>
                          <div className="text-[11px] text-muted-foreground/60 truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" /> {(job as any).customers?.address}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {job.revenue > 0 && (
                            <span className="text-xs font-bold text-foreground">€{job.revenue}</span>
                          )}
                          <Badge
                            className={`text-[9px] px-1.5 py-0 ${
                              job.status === "Completed" ? "bg-success/10 text-success border-success/20" :
                              ["En Route", "On Site", "In Progress"].includes(job.status) ? "bg-warning/10 text-warning border-warning/20" :
                              job.status === "Cancelled" ? "bg-destructive/10 text-destructive border-destructive/20" :
                              "bg-primary/10 text-primary border-primary/20"
                            }`}
                          >
                            {job.status}
                          </Badge>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
                      </div>
                    ))}
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

export default TodayTimeline;