import { useState } from "react";
import type { ScheduleJob } from "@/pages/Schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CalendarDays, Clock, X } from "lucide-react";

type Props = {
  jobs: ScheduleJob[];
  onAssign: (job: ScheduleJob) => void;
  onJobClick?: (job: ScheduleJob) => void;
  onRemove?: (job: ScheduleJob) => void;
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

const urgencyBadge = (type: string) => {
  if (type === "Emergency") {
    return <Badge className="bg-destructive text-destructive-foreground text-[10px]">Urgent</Badge>;
  }
  return null;
};

const UnallocatedJobs = ({ jobs, onAssign, onJobClick, onRemove }: Props) => {
  const [confirmJob, setConfirmJob] = useState<ScheduleJob | null>(null);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No unallocated jobs — all scheduled! ✓</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`relative flex items-center justify-between gap-2 rounded-md border p-3 bg-card ${
              job.job_type === "Emergency" ? "border-l-[3px] border-l-destructive" : "border-border"
            }`}
          >
            {/* Remove (X) button */}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmJob(job); }}
                className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove from schedule"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="min-w-0 flex-1 pr-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">BJ-{job.id.slice(0, 6).toUpperCase()}</span>
                {jobTypeBadge(job.job_type)}
                {urgencyBadge(job.job_type)}
              </div>
              {onJobClick ? (
                <button
                  onClick={() => onJobClick(job)}
                  className="text-sm font-semibold truncate mt-0.5 text-left hover:text-primary hover:underline transition-colors block max-w-full"
                >
                  {job.customer_name}
                </button>
              ) : (
                <p className="text-sm font-semibold truncate mt-0.5">{job.customer_name}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">{job.customer_address}</p>
              </div>
              {/* Preferred time indicator */}
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground">
                  {job.time_block || "Any Time – Office to Confirm"}
                </span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onAssign(job)} className="shrink-0">
              <CalendarDays className="w-3.5 h-3.5 mr-1" />
              Assign
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!confirmJob} onOpenChange={(open) => { if (!open) setConfirmJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move <span className="font-semibold text-foreground">{confirmJob?.customer_name}</span> (BJ-{confirmJob?.id.slice(0, 6).toUpperCase()}) to Pending status. You can reassign it later from the Jobs page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmJob && onRemove) { onRemove(confirmJob); setConfirmJob(null); } }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UnallocatedJobs;
