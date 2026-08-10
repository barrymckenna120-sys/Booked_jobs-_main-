import { useState, useCallback, useEffect } from "react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
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
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";

const DEFAULT_TIME_BLOCKS = ["9am–11am", "11am–1pm", "2pm–5pm"];

const formatTimeLabel = (start: string, end: string) => {
  const fmtHour = (t: string) => {
    const h = parseInt(t.split(":")[0], 10);
    const suffix = h >= 12 ? "pm" : "am";
    const display = h > 12 ? h - 12 : h;
    return `${display}${suffix}`;
  };
  return `${fmtHour(start)}–${fmtHour(end)}`;
};

const buildTimeBlocksFromSettings = (blocks: any[]): string[] => {
  if (!blocks || blocks.length === 0) return DEFAULT_TIME_BLOCKS;
  return blocks.map((s: any) => formatTimeLabel(s.start || "09:00", s.end || "17:00"));
};

// Build a comprehensive normalization map from settings labels to canonical time labels
const buildBlockMap = (settingsBlocks: any[], canonicalBlocks: string[]): Record<string, string> => {
  const map: Record<string, string> = {};
  // Always map canonical blocks to themselves
  canonicalBlocks.forEach(b => { map[b] = b; });
  // Map settings labels (Morning, Midday, Afternoon) to canonical
  if (settingsBlocks) {
    settingsBlocks.forEach((s: any, i: number) => {
      if (i < canonicalBlocks.length) {
        const label = s.label || "";
        map[label] = canonicalBlocks[i];
        map[label.toLowerCase()] = canonicalBlocks[i];
      }
    });
  }
  // Legacy aliases
  const legacyAliases: Record<string, number> = { "9–11": 0, "9-11": 0, "11–2": 1, "11-2": 1, "2–5": 2, "2-5": 2 };
  Object.entries(legacyAliases).forEach(([alias, idx]) => {
    if (idx < canonicalBlocks.length) map[alias] = canonicalBlocks[idx];
  });
  // Also map old default blocks to new canonical (handles 9am–11am → 8am–11am if settings changed)
  const oldDefaults = ["9am–11am", "11am–1pm", "2pm–5pm"];
  oldDefaults.forEach((old, i) => {
    if (i < canonicalBlocks.length && !map[old]) map[old] = canonicalBlocks[i];
  });
  return map;
};

const normalizeDash = (s: string) => s.replace(/[\u2013\u2014]/g, '-');

const normalizeBlock = (b: string | null, blockMap: Record<string, string>) => {
  if (!b) return null;
  const dashed = normalizeDash(b);
  // Build a dash-normalized map for comparison
  const normMap: Record<string, string> = {};
  Object.entries(blockMap).forEach(([k, v]) => { normMap[normalizeDash(k)] = normalizeDash(v); });
  if (normMap[dashed]) return normMap[dashed];
  // Strip spaces around dashes as fallback
  const stripped = dashed.replace(/\s*-\s*/g, '-');
  if (normMap[stripped]) return normMap[stripped];
  return dashed;
};

export type ScheduleJob = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_eircode: string | null;
  customer_area_code: string | null;
  customer_gprn: string | null;
  customer_boiler_location: string | null;
  customer_access_notes: string | null;
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
  boiler_model: string | null;
  user_id: string;
  parts_priority?: string | null;
  boiler_error_code?: string | null;
  boiler_working?: boolean | null;
  owner_or_tenant?: string | null;
  job_issue?: string | null;
  access_notes?: string | null;
  extra_details?: string | null;
  created_at: string;
  job_reference?: string | null;
  media_count?: number;
};

const Schedule = () => {
  const { user } = useAuth();
  const { orgId, ready } = useOrgId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Use Irish timezone to determine "today" so schedule aligns with Europe/Dublin
  const dublinNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Dublin' }));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dublinNow(), { weekStartsOn: 1 }));
  const [selectedEngineer, setSelectedEngineer] = useState<string>("all");
  const [assignModal, setAssignModal] = useState<{ open: boolean; job?: ScheduleJob; date?: Date; timeBlock?: string }>({ open: false });
  const [detailDrawer, setDetailDrawer] = useState<{ open: boolean; job?: ScheduleJob }>({ open: false });
  const [unallocatedOpen, setUnallocatedOpen] = useState(true);
  const [cancelModal, setCancelModal] = useState<{ open: boolean; job?: ScheduleJob }>({ open: false });
  const [hiddenUnallocatedJobIds, setHiddenUnallocatedJobIds] = useState<string[]>([]);

  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel = `${format(allWeekDays[0], "d")}–${format(allWeekDays[4], "d MMM yyyy")}`;

  // Fetch engineers
  const { data: engineers = [] } = useQuery({
    queryKey: ["engineers", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("engineers").select("id, name").eq("status", "active").order("name");
      return data || [];
    },
    enabled: !!user && ready,
  });

  // Fetch settings for slot capacity (max_jobs per time block)
  const { data: settings } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("settings")
        .select("job_time_blocks")
        .eq("organisation_id", orgId)
        .maybeSingle();
      return data;
    },
    enabled: !!user && ready && !!orgId,
  });

  const settingsBlocks = (settings?.job_time_blocks as any[]) || [];
  const TIME_BLOCKS = buildTimeBlocksFromSettings(settingsBlocks);
  const BLOCK_MAP = buildBlockMap(settingsBlocks, TIME_BLOCKS);

  // Fetch all jobs for the week + unallocated
  const { data: jobs = [] } = useQuery({
    queryKey: ["schedule-jobs", user?.id, format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const startStr = format(weekStart, "yyyy-MM-dd");

      // Get scheduled jobs for the week + unallocated jobs
      const { data: scheduledJobs } = await supabase
        .from("service_calls")
        .select("*, customers(name, address, phone, email, eircode, area_code, gprn, access_notes, boiler_make_model, boiler_location)")
        .or(`and(scheduled_date.gte.${startStr},scheduled_date.lte.${weekEnd}),scheduled_date.is.null,needs_scheduling.eq.true,time_block.is.null,assigned_engineer.is.null,assigned_engineer_id.is.null`)
        .not("status", "in", "(Completed,Cancelled,archived)");

      const rows = scheduledJobs || [];

      // Media counts for the visible jobs (single query, keeps card render cheap)
      const mediaCounts: Record<string, number> = {};
      const jobIds = rows.map((j: any) => j.id);
      if (jobIds.length > 0) {
        const { data: mediaRows } = await supabase
          .from("job_media")
          .select("job_id")
          .in("job_id", jobIds);
        (mediaRows || []).forEach((m: any) => {
          if (m.job_id) mediaCounts[m.job_id] = (mediaCounts[m.job_id] || 0) + 1;
        });
      }

      return rows.map((j: any) => ({
        id: j.id,
        customer_id: j.customer_id,
        customer_name: j.customers?.name || "Unknown",
        customer_address: j.customers?.address || "",
        customer_phone: j.customers?.phone || null,
        customer_email: j.customers?.email || j.email || null,
        customer_eircode: j.customers?.eircode || null,
        customer_area_code: j.customers?.area_code || j.area_code || null,
        customer_gprn: j.customers?.gprn || null,
        customer_boiler_location: j.customers?.boiler_location || null,
        customer_access_notes: j.customers?.access_notes || null,
        job_type: j.job_type,
        status: j.status,
        scheduled_date: j.scheduled_date,
        time_block: j.time_block,
        assigned_engineer: j.assigned_engineer,
        assigned_engineer_id: j.assigned_engineer_id,
        revenue: j.revenue,
        deposit_paid: j.deposit_paid,
        notes: j.notes,
        boiler_brand: j.boiler_brand || null,
        boiler_model: j.customers?.boiler_make_model || null,
        user_id: j.user_id,
        parts_priority: j.parts_priority || null,
        boiler_error_code: j.boiler_error_code || null,
        boiler_working: j.boiler_working ?? null,
        owner_or_tenant: j.owner_or_tenant || null,
        job_issue: j.job_issue || null,
        access_notes: j.access_notes || null,
        extra_details: j.extra_details || null,
        created_at: j.created_at,
        job_reference: j.job_reference || null,
        media_count: mediaCounts[j.id] || 0,
      })) as ScheduleJob[];
    },
    enabled: !!user && ready,
  });

  // Show Mon-Fri always; include Sat/Sun only if jobs exist on those days
  const hasJobOnDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return jobs.some((j) => j.scheduled_date?.slice(0, 10) === dateStr && j.status !== "Completed" && j.status !== "Cancelled" && j.status !== "archived");
  };
  const weekDays = allWeekDays.filter((day, i) => i < 5 || hasJobOnDay(day));

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
    (j) => {
      const s = j.status?.toLowerCase();
      if (hiddenUnallocatedJobIds.includes(j.id)) return false;
      if (s === "completed" || s === "cancelled" || s === "booked" || s === "archived") return false;
      return !j.assigned_engineer_id || !j.assigned_engineer || !j.scheduled_date || !j.time_block;
    }
  );

  const getJobForSlot = (date: Date, timeBlock: string, engineerName?: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return jobs.find((j) => {
      if (j.scheduled_date?.slice(0, 10) === '2026-05-11') {
        console.log('SLOT CHECK', {
          ref: j.job_reference,
          time_block_raw: j.time_block,
          time_block_json: JSON.stringify(j.time_block),
          timeBlock_row: timeBlock,
          timeBlock_row_json: JSON.stringify(timeBlock),
          normalized_job: normalizeBlock(j.time_block, BLOCK_MAP),
          normalized_row: normalizeBlock(timeBlock, BLOCK_MAP),
          match: normalizeBlock(j.time_block, BLOCK_MAP) === normalizeBlock(timeBlock, BLOCK_MAP),
          engineer_job: j.assigned_engineer,
          engineer_filter: engineerName,
          engineer_match: j.assigned_engineer === engineerName,
          status: j.status,
        });
      }
      return (
        j.scheduled_date?.slice(0, 10) === dateStr &&
        normalizeBlock(j.time_block, BLOCK_MAP) === normalizeDash(timeBlock) &&
        j.status !== "New" &&
        j.status !== "Contacted" &&
        (engineerName === "all" || !engineerName || j.assigned_engineer === engineerName)
      );
    });
  };

  const getSlotMaxJobs = (timeBlock: string): number => {
    const blocks = (settings?.job_time_blocks as any[]) || [];
    for (const block of blocks) {
      const canonical = normalizeBlock(block.label, BLOCK_MAP);
      if (canonical === normalizeDash(timeBlock)) return block.max_jobs ?? 2;
    }
    return 2; // fallback default
  };

  const isSlotFull = (date: Date, timeBlock: string, engineerName: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const count = jobs.filter(
      (j) =>
        j.scheduled_date?.slice(0, 10) === dateStr &&
        normalizeBlock(j.time_block, BLOCK_MAP) === normalizeDash(timeBlock) &&
        j.assigned_engineer === engineerName &&
        j.status !== "Completed" &&
        j.status !== "Cancelled"
    ).length;
    return count >= getSlotMaxJobs(timeBlock);
  };

  const handleAssign = async (jobId: string, date: Date, timeBlock: string, engineerName: string) => {
    // Check capacity
    if (isSlotFull(date, timeBlock, engineerName)) {
      const max = getSlotMaxJobs(timeBlock);
      toast({ title: "Slot full", description: `${engineerName} already has ${max} job${max !== 1 ? 's' : ''} in this slot.`, variant: "destructive" });
      return;
    }

    // Resolve engineer ID for the assigned_engineer_id column
    const matchedEngineer = engineers.find((e) => e.name === engineerName);

    // Capture existing values BEFORE update for change detection
    const { data: prevJob } = await supabase
      .from("service_calls")
      .select("assigned_engineer_id, scheduled_date, time_block, customer_id, job_reference, organisation_id, customers(name)")
      .eq("id", jobId)
      .maybeSingle();

    const oldEngineerId = (prevJob as any)?.assigned_engineer_id || null;
    const oldDate = (prevJob as any)?.scheduled_date || null;
    const oldBlock = (prevJob as any)?.time_block || null;
    const newEngineerId = matchedEngineer?.id || null;
    const newDateStr = `${format(date, "yyyy-MM-dd")}T12:00:00`;

    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({
        scheduled_date: newDateStr,
        time_block: timeBlock,
        assigned_engineer: engineerName,
        assigned_engineer_id: newEngineerId,
        status: "Booked",
        needs_scheduling: false,
      } as any))
      .eq("id", jobId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_assigned", entity_type: "service_call", entity_id: jobId, detail: `Assigned to ${engineerName} on ${format(date, "yyyy-MM-dd")} ${timeBlock}` });

      // Single WhatsApp confirmation (send-booking-confirmation handles both new + reschedule).
      // Failures here must never break scheduling — surface as a soft warning only.
      supabase.functions
        .invoke('send-booking-confirmation', { body: { service_call_id: jobId } })
        .then(({ error: waErr }) => {
          if (waErr) {
            console.error('send-booking-confirmation failed:', waErr);
            toast({
              title: "Job scheduled — WhatsApp not sent",
              description: "The confirmation message could not be delivered. Check the WhatsApp connection in Settings.",
            });
          }
        })
        .catch((err) => console.error('send-booking-confirmation failed:', err));


      // ---- Push notifications: reassign / reschedule ----
      try {
        const customerName = (prevJob as any)?.customers?.name || "Customer";
        const knNumber = (prevJob as any)?.job_reference || `KN-${jobId.slice(0, 6).toUpperCase()}`;
        const orgId = (prevJob as any)?.organisation_id || null;
        const formattedDate = format(date, "dd/MM/yyyy");

        const engineerChanged = oldEngineerId !== newEngineerId;
        const scheduleChanged = (oldDate || null) !== newDateStr || (oldBlock || null) !== timeBlock;

        const targets: { engineerId: string; title: string; body: string }[] = [];

        if (engineerChanged) {
          if (newEngineerId) {
            targets.push({
              engineerId: newEngineerId,
              title: "New Job Assigned",
              body: `${customerName} | ${knNumber} | ${formattedDate} at ${timeBlock}`,
            });
          }
          if (oldEngineerId) {
            targets.push({
              engineerId: oldEngineerId,
              title: "Job Removed",
              body: `${customerName} | ${knNumber} | ${formattedDate} at ${timeBlock}`,
            });
          }
        } else if (scheduleChanged && newEngineerId) {
          targets.push({
            engineerId: newEngineerId,
            title: "Job Rescheduled",
            body: `${customerName} | ${knNumber} | Now ${formattedDate} at ${timeBlock}`,
          });
        }

        if (targets.length > 0) {
          const ids = Array.from(new Set(targets.map((t) => t.engineerId)));
          const { data: engRows } = await supabase
            .from("engineers")
            .select("id, auth_user_id")
            .in("id", ids);
          const authMap = new Map<string, string>();
          (engRows || []).forEach((e: any) => { if (e.auth_user_id) authMap.set(e.id, e.auth_user_id); });

          for (const t of targets) {
            const authUserId = authMap.get(t.engineerId);
            if (!authUserId) continue;

            // Push
            supabase.functions.invoke("send-push-notification", {
              body: { recipient_user_id: authUserId, title: t.title, body: t.body, job_id: jobId },
            }).catch((err) => console.error("send-push-notification failed:", err));

            // In-app notification row
            await supabase.from("notifications").insert({
              recipient_user_id: authUserId,
              notification_type: "schedule_update",
              title: t.title,
              body: t.body,
              job_id: jobId,
              role: "engineer",
              organisation_id: orgId,
            } as any);
          }
        }
      } catch (notifyErr) {
        console.error("Schedule push notify error:", notifyErr);
      }

      // Check if new date falls outside currently viewed week
      const weekEndDate = addDays(weekStart, 6);
      if (date < weekStart || date > weekEndDate) {
        const targetWeekStart = startOfWeek(date, { weekStartsOn: 1 });
        const knNumber = (prevJob as any)?.job_reference || `KN-${jobId.slice(0, 6).toUpperCase()}`;
        toast({
          title: `${knNumber} moved to week of ${format(targetWeekStart, "EEE d MMM")}`,
          description: "Tap to view that week",
          action: (
            <Button size="sm" variant="outline" onClick={() => setWeekStart(targetWeekStart)}>
              Go to week
            </Button>
          ) as any,
        });
      } else {
        toast({ title: "Job assigned" });
      }
      setAssignModal({ open: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
    }
  };

  const handleMarkComplete = async (jobId: string) => {
    const { error } = await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ status: "Completed" })).eq("id", jobId);
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
    const { error } = await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({
      status: "Cancelled",
      cancellation_reason: reason,
      cancellation_note: note || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: user?.id || null,
    } as any)).eq("id", jobId);
    if (!error) {
      logAudit({ action_type: "job_cancelled", entity_type: "service_call", entity_id: jobId, detail: `Cancelled: ${reason}`, metadata: { reason, note } });
      supabase.functions.invoke('send-cancellation-notice', {
        body: { service_call_id: jobId },
      }).catch((err) => console.error('send-cancellation-notice failed:', err));
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
    setAssignModal({ open: true, job, timeBlock: job.time_block || undefined });
  };

  const openAssignFromCell = (date: Date, timeBlock: string) => {
    setAssignModal({ open: true, date, timeBlock });
  };

  const openAssignFromUnallocated = (job: ScheduleJob) => {
    setAssignModal({ open: true, job, timeBlock: job.time_block || undefined });
  };

  const handleRemoveFromSchedule = async (job: ScheduleJob) => {
    const { data: archivedJob, error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({ status: "archived" } as any))
      .eq("id", job.id)
      .select("id")
      .single();

    if (!error && archivedJob) {
      setHiddenUnallocatedJobIds((currentIds) => currentIds.includes(job.id) ? currentIds : [...currentIds, job.id]);
      queryClient.setQueryData(
        ["schedule-jobs", user?.id, format(weekStart, "yyyy-MM-dd")],
        (currentJobs: ScheduleJob[] | undefined) => currentJobs?.filter((currentJob) => currentJob.id !== job.id) ?? []
      );
      logAudit({ action_type: "job_archived", entity_type: "service_call", entity_id: job.id, detail: `${job.customer_name} archived from schedule` });
      toast({ title: "Job archived", description: "You can find it in the Jobs page under Archived filter." });
    } else {
      toast({ title: "Error", description: error?.message || "Failed to archive job", variant: "destructive" });
    }
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
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(dublinNow(), { weekStartsOn: 1 }))}>
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
              <UnallocatedJobs
                jobs={unallocatedJobs}
                onAssign={openAssignFromUnallocated}
                onJobClick={(job) => setDetailDrawer({ open: true, job })}
                onRemove={handleRemoveFromSchedule}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Weekly Grid */}
      <WeeklyGrid
        weekDays={weekDays}
        timeBlocks={TIME_BLOCKS}
        blockMap={BLOCK_MAP}
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
        jobRef={cancelModal.job ? (cancelModal.job.job_reference || `KN-${cancelModal.job.id.slice(0, 6).toUpperCase()}`) : ""}
        depositPaid={cancelModal.job?.deposit_paid}
        onConfirm={handleCancel}
      />
    </div>
  );
};

export default Schedule;
