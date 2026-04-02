import { useState, useEffect } from "react";
import { format } from "date-fns";
import type { ScheduleJob } from "@/pages/Schedule";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { validationBorderClass, ValidationMessage } from "@/components/shared/FormValidation";
import FormLeaveGuard from "@/components/shared/FormLeaveGuard";

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

type FieldErrors = { job?: boolean; date?: boolean; block?: boolean; engineer?: boolean };

const AssignJobModal = ({
  open, onOpenChange, job, defaultDate, defaultTimeBlock,
  weekDays, engineers, unallocatedJobs, onAssign,
}: Props) => {
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedBlock, setSelectedBlock] = useState<string>("");
  const [selectedEngineer, setSelectedEngineer] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<FieldErrors>({});
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedJobId(job?.id || "");
      setSelectedDate(defaultDate ? format(defaultDate, "yyyy-MM-dd") : "");
      setSelectedBlock(defaultTimeBlock || "");
      setSelectedEngineer(job?.assigned_engineer || engineers[0]?.name || "");
      setErrors({});
      setTouched({});
    }
  }, [open, job, defaultDate, defaultTimeBlock, engineers]);

  const isDirty = !!(selectedJobId || selectedDate || selectedBlock || selectedEngineer);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!job && !selectedJobId) e.job = true;
    if (!selectedDate) e.date = true;
    if (!selectedBlock) e.block = true;
    if (!selectedEngineer) e.engineer = true;
    return e;
  };

  const handleConfirm = () => {
    const e = validate();
    setErrors(e);
    setTouched({ job: true, date: true, block: true, engineer: true });
    if (Object.keys(e).length > 0) return;
    const date = weekDays.find((d) => format(d, "yyyy-MM-dd") === selectedDate) || new Date(selectedDate);
    onAssign(selectedJobId, date, selectedBlock, selectedEngineer);
  };

  const handleClose = () => {
    if (isDirty) {
      setShowLeaveGuard(true);
    } else {
      onOpenChange(false);
    }
  };

  const showError = (field: keyof FieldErrors) => !!(errors[field] && touched[field]);

  const buildTitle = () => {
    if (job) return "Assign / Move Job";
    const parts = ["Assign Job"];
    if (defaultDate) parts.push(`– ${format(defaultDate, "EEE d MMM")}`);
    if (defaultTimeBlock) parts.push(`– ${defaultTimeBlock}`);
    if (selectedEngineer) parts.push(`– ${selectedEngineer}`);
    return parts.join(" ");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="flex flex-row items-center gap-2 space-y-0">
            <button
              onClick={handleClose}
              className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <SheetTitle className="text-base flex-1">{buildTitle()}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 pt-4">
            {/* Job picker */}
            {!job && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Job</Label>
                <Select value={selectedJobId} onValueChange={(v) => { setSelectedJobId(v); setErrors((e) => ({ ...e, job: false })); }}>
                  <SelectTrigger className={validationBorderClass(showError("job"))}>
                    <SelectValue placeholder="Select job to assign" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {unallocatedJobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        <span className="font-mono text-muted-foreground mr-1">{j.job_reference || `KN-${j.id.slice(0, 6).toUpperCase()}`}</span>
                        {j.customer_name} – {j.job_type}
                      </SelectItem>
                    ))}
                    {unallocatedJobs.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No unallocated jobs available</div>
                    )}
                  </SelectContent>
                </Select>
                <ValidationMessage show={showError("job")} />
              </div>
            )}

            {job && (
              <div className="rounded-md border border-border p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">BJ-{job.id.slice(0, 6).toUpperCase()}</span>
                  <Badge className={
                    job.job_type === "Emergency"
                      ? "bg-destructive/10 text-destructive border-destructive/20 text-[10px]"
                      : job.job_type === "Repair"
                      ? "bg-warning/10 text-warning border-warning/20 text-[10px]"
                      : "bg-primary/10 text-primary border-primary/20 text-[10px]"
                  }>{job.job_type}</Badge>
                </div>
                <p className="text-sm font-semibold">{job.customer_name}</p>
                <p className="text-xs text-muted-foreground">{job.customer_address}</p>
              </div>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date</Label>
              <Select value={selectedDate} onValueChange={(v) => { setSelectedDate(v); setErrors((e) => ({ ...e, date: false })); }}>
                <SelectTrigger className={validationBorderClass(showError("date"))}>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {weekDays.map((d) => (
                    <SelectItem key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                      {format(d, "EEEE, d MMM")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ValidationMessage show={showError("date")} />
            </div>

            {/* Time Block */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Time Slot</Label>
              <Select value={selectedBlock} onValueChange={(v) => { setSelectedBlock(v); setErrors((e) => ({ ...e, block: false })); }}>
                <SelectTrigger className={validationBorderClass(showError("block"))}>
                  <SelectValue placeholder="Select slot" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {TIME_BLOCKS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ValidationMessage show={showError("block")} />
            </div>

            {/* Engineer */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Engineer</Label>
              <Select value={selectedEngineer} onValueChange={(v) => { setSelectedEngineer(v); setErrors((e) => ({ ...e, engineer: false })); }}>
                <SelectTrigger className={validationBorderClass(showError("engineer"))}>
                  <SelectValue placeholder="Select engineer" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {engineers.map((eng) => (
                    <SelectItem key={eng.id} value={eng.name}>{eng.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ValidationMessage show={showError("engineer")} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleConfirm}>Assign</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <FormLeaveGuard
        open={showLeaveGuard}
        onKeepEditing={() => setShowLeaveGuard(false)}
        onLeave={() => { setShowLeaveGuard(false); onOpenChange(false); }}
      />
    </>
  );
};

export default AssignJobModal;
