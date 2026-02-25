import { useState, useEffect } from "react";
import { format } from "date-fns";
import type { ScheduleJob } from "@/pages/Schedule";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const TIME_BLOCKS = ["9am–11am", "11am–1pm", "2pm–5pm"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: ScheduleJob;
  defaultDate?: Date;
  defaultTimeBlock?: string;
  weekDays: Date[];
  engineers: { id: string; name: string }[];
  unallocatedJobs: ScheduleJob[];
  onAssign: (jobId: string, date: Date, timeBlock: string, engineerName: string) => void;
};

const AssignJobModal = ({
  open, onOpenChange, job, defaultDate, defaultTimeBlock,
  weekDays, engineers, unallocatedJobs, onAssign,
}: Props) => {
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedBlock, setSelectedBlock] = useState<string>("");
  const [selectedEngineer, setSelectedEngineer] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedJobId(job?.id || "");
      setSelectedDate(defaultDate ? format(defaultDate, "yyyy-MM-dd") : "");
      setSelectedBlock(defaultTimeBlock || "");
      setSelectedEngineer(job?.assigned_engineer || engineers[0]?.name || "");
    }
  }, [open, job, defaultDate, defaultTimeBlock, engineers]);

  const handleConfirm = () => {
    if (!selectedJobId || !selectedDate || !selectedBlock || !selectedEngineer) return;
    const date = weekDays.find((d) => format(d, "yyyy-MM-dd") === selectedDate) || new Date(selectedDate);
    onAssign(selectedJobId, date, selectedBlock, selectedEngineer);
  };

  const jobsToShow = job ? [job] : unallocatedJobs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{job ? "Assign / Move Job" : "Assign Job to Slot"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Job picker (if opened from empty cell) */}
          {!job && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Job</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {unallocatedJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.customer_name} — {j.job_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {job && (
            <div className="rounded-md border border-border p-3 bg-muted/30">
              <p className="text-sm font-semibold">{job.customer_name}</p>
              <p className="text-xs text-muted-foreground">{job.job_type} • {job.customer_address}</p>
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Date</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {weekDays.map((d) => (
                  <SelectItem key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                    {format(d, "EEEE, d MMM")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Block */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Time Slot</Label>
            <Select value={selectedBlock} onValueChange={setSelectedBlock}>
              <SelectTrigger><SelectValue placeholder="Select slot" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {TIME_BLOCKS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Engineer */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Engineer</Label>
            <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
              <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {engineers.map((eng) => (
                  <SelectItem key={eng.id} value={eng.name}>{eng.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedJobId || !selectedDate || !selectedBlock || !selectedEngineer}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignJobModal;
