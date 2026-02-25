import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import EngineerJobCard from "@/components/engineer/EngineerJobCard";
import { useEngineerJobs } from "@/hooks/useEngineerJobs";

const EngineerUpcoming = () => {
  const { upcomingJobs, customers, loading, updateJob } = useEngineerJobs();

  // Group by date
  const grouped: Record<string, any[]> = {};
  upcomingJobs.forEach((j: any) => {
    const d = j.scheduled_date || "Unscheduled";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(j);
  });

  return (
    <>
      <div className="text-[17px] font-extrabold text-foreground">Upcoming Jobs</div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : upcomingJobs.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <div className="text-5xl mb-2.5">📅</div>
          <div className="text-lg font-extrabold text-foreground mb-1">No upcoming jobs</div>
          <div className="text-sm text-muted-foreground">Your schedule is clear.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([date, dateJobs]) => (
          <div key={date}>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-2">
              📅 {date !== "Unscheduled" ? format(new Date(date + "T00:00:00"), "EEEE d MMM") : "Unscheduled"}
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
