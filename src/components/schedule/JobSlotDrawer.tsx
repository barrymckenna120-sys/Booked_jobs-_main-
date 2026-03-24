import type { ScheduleJob } from "@/pages/Schedule";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, ArrowRightLeft, XCircle, MapPin, Wrench } from "lucide-react";
import { formatDateIE } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: ScheduleJob;
  onMarkComplete: (jobId: string) => void;
  onMoveSlot: (job: ScheduleJob) => void;
  onCancel: (jobId: string) => void;
};

const JobSlotDrawer = ({ open, onOpenChange, job, onMarkComplete, onMoveSlot, onCancel }: Props) => {
  if (!job) return null;

  const jobRef = `BJ-${job.id.slice(0, 6).toUpperCase()}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-sm">{jobRef}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Customer Info */}
          <div>
            <h3 className="text-lg font-bold">{job.customer_name}</h3>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <MapPin className="w-3.5 h-3.5" />
              {job.customer_address}
            </div>
          </div>

          <Separator />

          {/* Job Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Job Type</span>
              <div className="mt-0.5">
                <Badge className={
                  job.job_type === "Emergency"
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : job.job_type === "Repair"
                    ? "bg-warning/10 text-warning border-warning/20"
                    : "bg-primary/10 text-primary border-primary/20"
                }>
                  {job.job_type}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <p className={`font-semibold mt-0.5 ${job.status === "parts_needed" ? "text-amber-600" : ""}`}>
                {job.status === "parts_needed" ? "Parts Needed" : job.status === "no_show" ? "No Show" : job.status}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Date</span>
              <p className="font-semibold mt-0.5">{formatDateIE(job.scheduled_date)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Time Slot</span>
              <p className="font-semibold mt-0.5">{job.time_block || "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Engineer</span>
              <div className="flex items-center gap-1 mt-0.5">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-semibold">{job.assigned_engineer || "—"}</span>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Revenue</span>
              <p className="font-semibold mt-0.5">{job.revenue ? `€${job.revenue}` : "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Payment</span>
              <p className={`font-semibold mt-0.5 ${job.deposit_paid ? "text-success" : "text-warning"}`}>
                {job.deposit_paid ? "Paid" : "Unpaid"}
              </p>
            </div>
            {job.boiler_brand && (
              <div>
                <span className="text-xs text-muted-foreground">Boiler</span>
                <p className="font-semibold mt-0.5">{job.boiler_brand}</p>
              </div>
            )}
          </div>

          {job.notes && (
            <>
              <Separator />
              <div>
                <span className="text-xs text-muted-foreground">Notes</span>
                <p className="text-sm mt-1">{job.notes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full" onClick={() => onMarkComplete(job.id)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Complete
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onMoveSlot(job)}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Move Slot / Reassign
            </Button>
            <Button variant="destructive" className="w-full" onClick={() => onCancel(job.id)}>
              <XCircle className="w-4 h-4 mr-1" /> Cancel Job
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default JobSlotDrawer;
