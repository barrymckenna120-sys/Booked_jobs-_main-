import { useState, useCallback, useEffect } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import WeeklyGrid from "@/components/schedule/WeeklyGrid";
import UnallocatedJobs from "@/components/schedule/UnallocatedJobs";
import AssignJobModal from "@/components/schedule/AssignJobModal";
import JobSlotDrawer from "@/components/schedule/JobSlotDrawer";
import CancelJobModal from "@/components/jobs/CancelJobModal";

const TIME_BLOCKS = ["9am–11am", "11am–1pm", "2pm–5pm"] as const;

// Normalize all time_block variants to canonical form
const BLOCK_MAP: Record<string, string> = {
  "9–11": "9am–11am", "9-11": "9am–11am", "morning": "9am–11am", "Morning": "9am–11am", "9am–11am": "9am–11am",
  "11–2": "11am–1pm", "11-2": "11am–1pm", "midday": "11am–1pm", "Midday": "11am–1pm", "11am–1pm": "11am–1pm",
  "2–5": "2pm–5pm", "2-5": "2pm–5pm", "afternoon": "2pm–5pm", "Afternoon": "2pm–5pm", "2pm–5pm": "2pm–5pm",
};
const normalizeBlock = (b: string | null) => (b ? BLOCK_MAP[b] || b : null);

export type ScheduleJob = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_address: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  assigned_engineer_id: string | null;
  revenue: number | null;
  deposit_paid: boolean;
  notes: string | null;
  boiler_brand: string | null;
  user_id: string;
};

const Schedule = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedEngineer, setSelectedEngineer] = useState<string>("all");
  const [assignModal, setAssignModal] = useState<{ open: boolean; job?: ScheduleJob; date?: Date; timeBlock?: string }>({ open: false });
  const [detailDrawer, setDetailDrawer] = useState<{ open: boolean; job?: ScheduleJob }>({ open: false });
  const [unallocatedOpen, setUnallocatedOpen] = useState(true);
  const [cancelModal, setCancelModal] = useState<{ open: boolean; job?: ScheduleJob }>({ open: false });

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const weekLabel = `${format(weekDays[0], "d")}–${format(weekDays[4], "d MMM yyyy")}`;

  // Fetch engineers
  const { data: engineers = [] } = useQuery({
    queryKey: ["engineers", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("engineers").select("id, name").order("name");
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all jobs for the week + unallocated
  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["schedule-jobs", user?.id, format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = format(addDays(weekStart, 4), "yyyy-MM-dd");
      const startStr = format(weekStart, "yyyy-MM-dd");

      // Get scheduled jobs for the week + unallocated jobs
      const { data: scheduledJobs } = await supabase
        .from("service_calls")
        .select("*, customers!inner(name, address, boiler_make_model)")
        .or(`and(scheduled_date.gte.${startStr},scheduled_date.lte.${weekEnd}),scheduled_date.is.null,needs_scheduling.eq.true,time_block.is.null,assigned_engineer.is.null`)
        .not("status", "in", "(Completed,Cancelled)");

      return (scheduledJobs || []).map((j: any) => ({
        id: j.id,
        customer_id: j.customer_id,
        customer_name: j.customers?.name || "Unknown",
        customer_address: j.customers?.address || "",
        job_type: j.job_type,
        status: j.status,
        scheduled_date: j.scheduled_date,
        time_block: j.time_block,
        assigned_engineer: j.assigned_engineer,
        assigned_engineer_id: j.assigned_engineer_id,
        revenue: j.revenue,
        deposit_paid: j.deposit_paid,
        notes: j.notes,
        boiler_brand: j.customers?.boiler_make_model || null,
        user_id: j.user_id,
      })) as ScheduleJob[];
    },
    enabled: !!user,
  });

  // Realtime: auto-refresh when any service_call changes
  useEffect(() => {
    const channel = supabase
      .channel("schedule-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const unallocatedJobs = jobs.filter(
    (j) => j.status !== "Completed" && j.status !== "Cancelled" && j.status !== "Booked" && (!j.scheduled_date || !j.time_block || !j.assigned_engineer)
  );

  const getJobForSlot = (date: Date, timeBlock: string, engineerName?: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return jobs.find(
      (j) =>
        j.scheduled_date === dateStr &&
        normalizeBlock(j.time_block) === timeBlock &&
        j.status !== "New" &&
        j.status !== "Contacted" &&
        (engineerName === "all" || !engineerName || j.assigned_engineer === engineerName)
    );
  };

  const isSlotTaken = (date: Date, timeBlock: string, engineerName: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return jobs.some(
      (j) =>
        j.scheduled_date === dateStr &&
        normalizeBlock(j.time_block) === timeBlock &&
        j.assigned_engineer === engineerName &&
        j.status !== "Completed" &&
        j.status !== "Cancelled"
    );
  };

  const handleAssign = async (jobId: string, date: Date, timeBlock: string, engineerName: string) => {
    // Check double booking
    if (isSlotTaken(date, timeBlock, engineerName)) {
      toast({ title: "Slot taken", description: `${engineerName} already has a job in this slot.`, variant: "destructive" });
      return;
    }

    // Resolve engineer ID for the assigned_engineer_id column
    const matchedEngineer = engineers.find((e) => e.name === engineerName);

    const { error } = await supabase
      .from("service_calls")
      .update({
        scheduled_date: format(date, "yyyy-MM-dd"),
        time_block: timeBlock,
        assigned_engineer: engineerName,
        assigned_engineer_id: matchedEngineer?.id || null,
        status: "Booked",
        needs_scheduling: false,
      } as any)
      .eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_assigned", entity_type: "service_call", entity_id: jobId, detail: `Assigned to ${engineerName} on ${format(date, "yyyy-MM-dd")} ${timeBlock}` });
      toast({ title: "Job assigned" });
      setAssignModal({ open: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
    }
  };

  const handleMarkComplete = async (jobId: string) => {
    const { error } = await supabase.from("service_calls").update({ status: "Completed" }).eq("id", jobId);
    if (!error) {
      logAudit({ action_type: "job_completed", entity_type: "service_call", entity_id: jobId, detail: "Job marked complete from schedule" });
      toast({ title: "Job completed" });
      setDetailDrawer({ open: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
    }
  };

  const handleCancel = async (reason: string, note: string) => {
    const jobId = cancelModal.job?.id;
    if (!jobId) return;
    const { error } = await supabase.from("service_calls").update({
      status: "Cancelled",
      cancellation_reason: reason,
      cancellation_note: note || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: user?.id || null,
    } as any).eq("id", jobId);
    if (!error) {
      logAudit({ action_type: "job_cancelled", entity_type: "service_call", entity_id: jobId, detail: `Cancelled: ${reason}`, metadata: { reason, note } });
      toast({ title: "Job cancelled" });
      setCancelModal({ open: false });
      setDetailDrawer({ open: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
    }
  };

  const openCancelModal = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    setCancelModal({ open: true, job });
  };

  const handleMoveSlot = (job: ScheduleJob) => {
    setDetailDrawer({ open: false });
    setAssignModal({ open: true, job });
  };

  const openAssignFromCell = (date: Date, timeBlock: string) => {
    setAssignModal({ open: true, date, timeBlock });
  };

  const openAssignFromUnallocated = (job: ScheduleJob) => {
    setAssignModal({ open: true, job });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Schedule</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{weekLabel}</span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
      </div>

      {/* Engineer Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedEngineer === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedEngineer("all")}
        >
          All Engineers
        </Button>
        {engineers.map((eng: any) => (
          <Button
            key={eng.id}
            variant={selectedEngineer === eng.name ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedEngineer(eng.name)}
          >
            {eng.name}
          </Button>
        ))}
      </div>

      {/* Unallocated Jobs */}
      <Collapsible open={unallocatedOpen} onOpenChange={setUnallocatedOpen}>
        <Card className="shadow-sm">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-5 py-3 text-left">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Unallocated Jobs</span>
                {unallocatedJobs.length > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-xs font-bold w-5 h-5">
                    {unallocatedJobs.length}
                  </span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${unallocatedOpen ? "rotate-90" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              <UnallocatedJobs jobs={unallocatedJobs} onAssign={openAssignFromUnallocated} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Weekly Grid */}
      <WeeklyGrid
        weekDays={weekDays}
        timeBlocks={TIME_BLOCKS as unknown as string[]}
        jobs={jobs}
        selectedEngineer={selectedEngineer}
        engineers={engineers}
        onCellClick={openAssignFromCell}
        onJobClick={(job) => setDetailDrawer({ open: true, job })}
      />

      {/* Assign Modal */}
      <AssignJobModal
        open={assignModal.open}
        onOpenChange={(open) => setAssignModal({ ...assignModal, open })}
        job={assignModal.job}
        defaultDate={assignModal.date}
        defaultTimeBlock={assignModal.timeBlock}
        weekDays={weekDays}
        engineers={engineers}
        unallocatedJobs={unallocatedJobs}
        onAssign={handleAssign}
      />

      {/* Job Detail Drawer — always use fresh data from jobs array */}
      <JobSlotDrawer
        open={detailDrawer.open}
        onOpenChange={(open) => setDetailDrawer({ ...detailDrawer, open })}
        job={detailDrawer.job ? jobs.find(j => j.id === detailDrawer.job!.id) || detailDrawer.job : undefined}
        onMarkComplete={handleMarkComplete}
        onMoveSlot={handleMoveSlot}
        onCancel={openCancelModal}
      />

      {/* Cancel Job Modal */}
      <CancelJobModal
        open={cancelModal.open}
        onOpenChange={(open) => setCancelModal({ ...cancelModal, open })}
        jobRef={cancelModal.job ? `BJ-${cancelModal.job.id.slice(0, 6).toUpperCase()}` : ""}
        depositPaid={cancelModal.job?.deposit_paid}
        onConfirm={handleCancel}
      />
    </div>
  );
};

export default Schedule;
