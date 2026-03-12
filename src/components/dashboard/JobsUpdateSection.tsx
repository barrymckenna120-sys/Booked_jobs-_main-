import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Loader2 } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";

interface JobRow {
  id: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  customer_name: string;
  customer_address: string;
  engineer_name: string | null;
  is_today: boolean;
}

const JobsUpdateSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["jobs-update", user?.id, todayStr],
    queryFn: async () => {
      // Fetch week's jobs that are incomplete or cancelled
      const { data: jobs, error } = await supabase
        .from("service_calls")
        .select("id, status, scheduled_date, time_block, customer_id, assigned_engineer_id, customers(name, address), engineers:assigned_engineer_id(name)")
        .eq("user_id", user!.id)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd);

      if (error) throw error;

      const incompleteToday = (jobs || []).filter(
        (j: any) => j.scheduled_date === todayStr && j.status !== "Completed" && j.status !== "Cancelled"
      );
      const incompleteWeek = (jobs || []).filter(
        (j: any) => j.status !== "Completed" && j.status !== "Cancelled"
      );
      const cancelledWeek = (jobs || []).filter(
        (j: any) => j.status === "Cancelled"
      );

      // Build list: incomplete today + cancelled this week (deduplicated)
      const listIds = new Set<string>();
      const listJobs: JobRow[] = [];

      for (const j of incompleteToday) {
        listIds.add(j.id);
        listJobs.push({
          id: j.id,
          status: "Incomplete",
          scheduled_date: j.scheduled_date,
          time_block: j.time_block,
          customer_name: (j as any).customers?.name || "Unknown",
          customer_address: (j as any).customers?.address || "",
          engineer_name: (j as any).engineers?.name || null,
          is_today: true,
        });
      }
      for (const j of cancelledWeek) {
        if (!listIds.has(j.id)) {
          listJobs.push({
            id: j.id,
            status: "Cancelled",
            scheduled_date: j.scheduled_date,
            time_block: j.time_block,
            customer_name: (j as any).customers?.name || "Unknown",
            customer_address: (j as any).customers?.address || "",
            engineer_name: (j as any).engineers?.name || null,
            is_today: j.scheduled_date === todayStr,
          });
        }
      }

      return {
        incompleteToday: incompleteToday.length,
        incompleteWeek: incompleteWeek.length,
        cancelledWeek: cancelledWeek.length,
        list: listJobs,
      };
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Card className="border-[0.5px] rounded-xl">
        <CardContent className="p-5 flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const { incompleteToday = 0, incompleteWeek = 0, cancelledWeek = 0, list = [] } = data || {};

  const metrics = [
    { label: "Incomplete today", value: incompleteToday, color: "#BA7517" },
    { label: "Incomplete this week", value: incompleteWeek, color: "#185FA5" },
    { label: "Cancelled this week", value: cancelledWeek, color: "#A32D2D" },
  ];

  return (
    <Card className="border-[0.5px] rounded-xl">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Jobs update
          </span>
          <button
            onClick={() => navigate("/jobs?status=incomplete,cancelled")}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-secondary rounded-lg px-3.5 py-3"
            >
              <p className="text-2xl font-extrabold leading-none" style={{ color: m.color }}>
                {m.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">
                {m.label}
              </p>
            </div>
          ))}
        </div>

        {/* Job List */}
        {list.length > 0 && (
          <div className="divide-y divide-border/50">
            {list.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                {/* Status badge */}
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    job.status === "Cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {job.status}
                </span>

                {/* Customer info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {job.customer_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {job.customer_address}
                    {job.engineer_name && ` · ${job.engineer_name}`}
                  </p>
                </div>

                {/* Time */}
                {job.time_block && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {job.time_block}
                  </span>
                )}

                {/* View link */}
                <button
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0"
                >
                  View <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JobsUpdateSection;
