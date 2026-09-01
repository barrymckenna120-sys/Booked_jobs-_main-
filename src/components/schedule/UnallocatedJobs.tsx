import { useState, useMemo } from "react";
import type { ScheduleJob } from "@/pages/Schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CalendarDays, Clock, X, ArrowUpDown, Camera, RotateCw } from "lucide-react";
import { format, isToday } from "date-fns";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";
import PossibleDuplicateBadge from "@/components/jobs/PossibleDuplicateBadge";

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
      return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{type || "Service"}</Badge>;
  }
};

const urgencyBadge = (type: string) => {
  if (type === "Emergency") {
    return <Badge className="bg-destructive text-destructive-foreground text-[10px]">Urgent</Badge>;
  }
  return null;
};

const formatTimestamp = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    if (isToday(date)) {
      return `Today ${format(date, "HH:mm")}`;
    }
    return format(date, "d MMM");
  } catch {
    return "";
  }
};

const JOB_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "Boiler Service", label: "Service" },
  { value: "Repair", label: "Repair" },
  { value: "Emergency", label: "Emergency" },
  { value: "Installation", label: "Installation" },
  { value: "Boiler Replacement", label: "Boiler Replacement" },
];

const UnallocatedJobs = ({ jobs, onAssign, onJobClick, onRemove }: Props) => {
  const [confirmJob, setConfirmJob] = useState<ScheduleJob | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [filterType, setFilterType] = useState("all");

  const filteredAndSorted = useMemo(() => {
    let result = [...jobs];
    if (filterType !== "all") {
      result = result.filter((j) => j.job_type === filterType);
    }
    result.sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });
    return result;
  }, [jobs, sortOrder, filterType]);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No unallocated jobs — all scheduled! ✓</p>
    );
  }

  return (
    <>
      {/* Sort / Filter bar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredAndSorted.length} of {jobs.length} jobs
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredAndSorted.map((job) => (
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
                <span className="text-xs font-mono text-muted-foreground">{job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`}</span>
                {jobTypeBadge(job.job_type)}
                {job.source === "Renewal" && (
                  <Badge
                    className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0"
                    title="Rebooking (Renewal)"
                    aria-label="Rebooking (Renewal)"
                  >
                    <RotateCw size={12} />
                  </Badge>
                )}
                {urgencyBadge(job.job_type)}
                {(job.media_count ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-1.5 py-0 shrink-0"
                    title={`${job.media_count} photo${job.media_count === 1 ? "" : "s"} / video${job.media_count === 1 ? "" : "s"}`}
                  >
                    <Camera className="w-2.5 h-2.5" /> {job.media_count}
                  </span>
                )}
                <NewCustomerBadge status={job.customer_status_at_booking} size="sm" />
                <PossibleDuplicateBadge flagged={job.possible_duplicate} size="sm" />
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
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {job.time_block || "Any Time – Office to Confirm"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/70">
                  {formatTimestamp(job.created_at)}
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

      {filteredAndSorted.length === 0 && jobs.length > 0 && (
        <p className="text-sm text-muted-foreground py-2">No jobs match the selected filter.</p>
      )}

      <AlertDialog open={!!confirmJob} onOpenChange={(open) => { if (!open) setConfirmJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this job?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{confirmJob?.customer_name}</span> ({confirmJob?.job_reference || `KN-${confirmJob?.id.slice(0, 6).toUpperCase()}`}) will be hidden from the schedule. You can still find it on the Jobs page using the Archived filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmJob && onRemove) { onRemove(confirmJob); setConfirmJob(null); } }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UnallocatedJobs;
