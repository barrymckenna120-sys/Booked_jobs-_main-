import type { ScheduleJob } from "@/pages/Schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

type Props = {
  jobs: ScheduleJob[];
  onAssign: (job: ScheduleJob) => void;
};

const jobTypeBadge = (type: string) => {
  switch (type) {
    case "Repair":
      return <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px]">Repair</Badge>;
    case "Emergency":
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Emergency</Badge>;
    default:
      return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Service</Badge>;
  }
};

const UnallocatedJobs = ({ jobs, onAssign }: Props) => {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No unallocated jobs — all scheduled! ✓</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border p-3 bg-card"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">BJ-{job.id.slice(0, 6).toUpperCase()}</span>
              {jobTypeBadge(job.job_type)}
            </div>
            <p className="text-sm font-semibold truncate mt-0.5">{job.customer_name}</p>
            <p className="text-xs text-muted-foreground truncate">{job.customer_address}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onAssign(job)} className="shrink-0">
            <CalendarDays className="w-3.5 h-3.5 mr-1" />
            Assign
          </Button>
        </div>
      ))}
    </div>
  );
};

export default UnallocatedJobs;
