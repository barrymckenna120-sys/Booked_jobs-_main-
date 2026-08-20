import { useEffect } from "react";
import { Loader2, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { useOutletContext } from "react-router-dom";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import type { EngineerJobsState } from "@/hooks/useEngineerJobs";
import { timeBlockStartMinutes } from "@/lib/timeBlock";

const EngineerUpcoming = () => {
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, []);
  const { upcomingJobs, customers, loading, updateJob } = useOutletContext<EngineerJobsState>();

  // Group by date
  const grouped: Record<string, any[]> = {};
  upcomingJobs.forEach((j: any) => {
    const d = j.scheduled_date || "Unscheduled";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(j);
  });

  return (
    <>
      <div className="text-lg font-extrabold text-foreground">Upcoming Jobs</div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : upcomingJobs.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border/60">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <div className="text-lg font-extrabold text-foreground mb-1.5">No upcoming jobs</div>
          <div className="text-sm text-muted-foreground/70">Your schedule is clear.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([date, dateJobs]) => (
          <div key={date}>
            <div className="text-xs font-bold text-muted-foreground/70 uppercase tracking-wider mb-3 mt-3 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> {date !== "Unscheduled" ? format(new Date(date + "T00:00:00"), "EEEE d MMM") : "Unscheduled"}
            </div>
            {dateJobs.map((job: any) => (
              <EngineerJobCard key={job.id} job={job} customer={customers[job.customer_id] || {}} onUpdate={updateJob} />
            ))}
          </div>
        ))
      )}
    </>
  );
};

export default EngineerUpcoming;
