import { useState, useEffect } from "react";
import JobCertsTab from "@/components/engineer/JobCertsTab";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { formatDateIE } from "@/lib/utils";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Package, CalendarClock, PackageCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, RefreshCw, XCircle, User, Loader2, AlertTriangle, Play, Ban, Wrench, UserCog, Banknote, CreditCard, FileText, Award, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QuotePanel from "@/components/jobs/QuotePanel";
import ExtraWorkPendingCard from "@/components/jobs/ExtraWorkPendingCard";
import MediaGallery from "@/components/media/MediaGallery";
import CancelJobModal from "@/components/jobs/CancelJobModal";
import NoShowSheet from "@/components/engineer/NoShowSheet";
import PartsNeededSheet from "@/components/engineer/PartsNeededSheet";
import TakePaymentModal from "@/components/payments/TakePaymentModal";
import MessageEngineerModal from "@/components/messages/MessageEngineerModal";
import JobMessageThread from "@/components/messages/JobMessageThread";
import WhatsAppHistory from "@/components/whatsapp/WhatsAppHistory";

import InlineOfficeReply from "@/components/messages/InlineOfficeReply";
import PartsArrivedModal from "@/components/jobs/PartsArrivedModal";
import JobConfirmedBadge from "@/components/jobs/JobConfirmedBadge";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";
import { insertPartsRequest } from "@/lib/partsRequests";


type ServiceCall = {
  id: string;
  customer_id: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  notes: string | null;
  has_quote: boolean;
  revenue: number | null;
  deposit_required: boolean;
  deposit_paid: boolean;
  deposit_amount: number | null;
  balance_due: number | null;
  payment_status: string | null;
  boiler_brand: string | null;
  boiler_working: boolean | null;
  boiler_issue: string | null;
  source: string | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  assigned_engineer_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  user_id: string;
  receipt_number: string | null;
  completed_at: string | null;
};

type Engineer = {
  id: string;
  name: string;
};
type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  eircode: string;
  area_code: string | null;
  gprn: string | null;
  access_notes: string | null;
  boiler_make_model: string | null;
  boiler_location: string | null;
};

const jobTypeBadge = (type: string) => {
  const styles: Record<string, string> = {
    "Boiler Service": "bg-primary/10 text-primary",
    "Repair": "bg-warning/10 text-warning",
    "Emergency": "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[type] || "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
};

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    Scheduled: "bg-primary/10 text-primary",
    Completed: "bg-success/10 text-success",
    Cancelled: "bg-destructive/10 text-destructive",
    "Awaiting Deposit": "bg-warning/10 text-warning",
    "In Progress": "bg-warning/10 text-warning",
    no_show: "bg-destructive/10 text-destructive",
    parts_needed: "bg-amber-500/10 text-amber-500",
    parts_ordered: "bg-blue-100 text-blue-600",
    parts_arrived: "bg-[#F3E8FF] text-[#7C3AED]",
  };
  const labels: Record<string, string> = { no_show: "No Show", parts_needed: "Parts Needed", parts_ordered: "Parts Ordered", parts_arrived: "Awaiting Booking" };
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[status] || "bg-muted text-muted-foreground"}`}>
      {labels[status] || status}
    </span>
  );
};

import {
  PART_PRIORITY_CONFIG,
  PART_STATUS_CONFIG,
  canEditPartsOfficeFields,
  priorityRank,
  updatePartStatus,
  type PartStatus,
} from "@/lib/partsRequests";
import PartStatusIcon from "@/components/parts/PartStatusIcon";
import PartStatusTrail from "@/components/parts/PartStatusTrail";
import PartTrackingDetails from "@/components/parts/PartTrackingDetails";
import PartTrackingEditSheet from "@/components/parts/PartTrackingEditSheet";
import PartCommentsThread from "@/components/parts/PartCommentsThread";
import { useUserRole } from "@/hooks/useUserRole";
import { SlidersHorizontal } from "lucide-react";



const useJobParts = (jobId: string) =>
  useQuery({
    queryKey: ["job-parts", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("parts_requests" as any)
        .select("*")
        .eq("service_call_id", jobId)
        .order("created_at", { ascending: true });
      const rows = ((data as any[]) || []).slice();
      rows.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
      return rows;
    },
    enabled: !!jobId,
  });

const fmtPartsLoggedAt = (iso: string) => {
  const dt = new Date(iso);
  const day = dt.getDate();
  const mon = dt.toLocaleDateString("en-IE", { month: "short" });
  const year = dt.getFullYear();
  const time = dt.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${mon} ${year}, ${time}`;
};

const PartsNeededSection = ({ job, onStatusChange, onPartsArrived }: { job: any; onStatusChange: () => void; onPartsArrived?: (readyPartIds: string[]) => void }) => {
  const { data: parts = [], refetch } = useJobParts(job.id);
  const { toast } = useToast();
  const { user } = useAuth();
  const { role, engineerName } = useUserRole(user);
  const canEditTracking = canEditPartsOfficeFields(role);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<any>(null);


  // BJ-0069 — the section is permanent: active work up top, cancelled parts kept
  // below with their timestamps so the job's parts record survives.
  const active = parts.filter((p: any) => p.status !== "Cancelled");
  const history = parts.filter((p: any) => p.status === "Cancelled");
  const isOrdered = job.status === "parts_ordered";
  const isArrived = job.status === "parts_arrived";
  const noActive = active.length === 0;
  const accentBorder = noActive ? "border-border" : isArrived ? "border-[#7C3AED]" : isOrdered ? "border-blue-500" : "border-amber-500";
  const accentBg = noActive ? "" : isArrived ? "bg-[#FAF5FF]" : isOrdered ? "bg-blue-50" : "bg-[#FFFBEB]";
  const accentTitle = noActive ? "" : isArrived ? "text-[#6D28D9]" : isOrdered ? "text-blue-800" : "text-amber-800";
  const title = noActive ? "Parts" : isArrived ? "Parts Ready to Fit" : isOrdered ? "Parts Ordered" : "Parts Needed";

  const advance = async (part: any, status: PartStatus) => {
    setBusyId(part.id);
    const { error } = await updatePartStatus(part.id, status);
    setBusyId(null);
    if (error) {
      toast({ title: "Couldn't update part", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "Cancelled" ? "Part cancelled" : `Marked ${status}` });
    await refetch();
    onStatusChange();
  };

  if (parts.length === 0) return null;

  return (
    <Card className={`border-l-4 ${accentBorder} ${accentBg}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-base flex items-center gap-2 ${accentTitle}`}>
          {noActive ? <Package className="w-4 h-4 text-muted-foreground" /> : isOrdered ? <Package className="w-4 h-4 text-blue-500" /> : <Wrench className="w-4 h-4 text-amber-500" />}
          {title}
          <span className="text-xs font-semibold text-muted-foreground">({noActive ? parts.length : active.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.map((part: any) => {
          const pCfg = PART_PRIORITY_CONFIG[part.priority];
          const sCfg = PART_STATUS_CONFIG[part.status] || PART_STATUS_CONFIG.Open;
          return (
            <div key={part.id} className="rounded-lg bg-background/70 border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {part.quantity > 1 ? `${part.quantity} × ` : ""}{part.description}
                </p>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sCfg.bg} ${sCfg.text}`}>
                    <PartStatusIcon status={part.status} className="w-3 h-3" strokeWidth={2.5} />
                    {sCfg.label}
                  </span>

                  {pCfg && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pCfg.bg} ${pCfg.text}`}>
                      {pCfg.emoji} {pCfg.label}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Logged by {part.logged_by_name || job.assigned_engineer || "Engineer"} · {fmtPartsLoggedAt(part.created_at)}
              </p>
              <div className="flex flex-wrap gap-2">
                {part.status === "Open" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-500 text-amber-600 hover:bg-amber-50 gap-1.5"
                    disabled={busyId === part.id}
                    onClick={() => advance(part, "Ordered")}
                  >
                    <Package className="w-4 h-4" /> Mark as Ordered
                  </Button>
                )}
                {part.status === "Ordered" && (
                  <Button
                    size="sm"
                    className="gap-1.5 text-white font-bold"
                    style={{ backgroundColor: "#22C55E" }}
                    disabled={busyId === part.id}
                    onClick={() => advance(part, "Ready to Fit")}
                  >
                    <PackageCheck className="w-4 h-4" /> Part Arrived
                  </Button>
                )}
                {part.status !== "Ready to Fit" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={busyId === part.id}
                    onClick={() => advance(part, "Cancelled")}
                  >
                    Cancel
                  </Button>
                )}
                {canEditTracking && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground gap-1.5"
                    onClick={() => setEditingPart(part)}
                  >
                    <SlidersHorizontal className="w-4 h-4" strokeWidth={2.5} /> Cost / ETA
                  </Button>
                )}
              </div>
              <PartStatusTrail row={part} className="pt-2 border-t border-border/60" />
              {/* BJ-0071 / BJ-0072 — cost, ETA, customer-told and quote reference. */}
              <PartTrackingDetails row={part} />
              <PartCommentsThread
                partsRequestId={part.id}
                organisationId={part.organisation_id || job.organisation_id}
                authorName={engineerName || user?.email || null}
                authorRole={role}
                className="pt-2 border-t border-border/60"
              />
            </div>

          );
        })}

        {active.some((p: any) => p.status === "Ready to Fit") && (
          <Button
            className="gap-2 text-white font-bold w-full sm:w-auto"
            style={{ backgroundColor: "#22C55E" }}
            onClick={() =>
              onPartsArrived?.(
                active.filter((p: any) => p.status === "Ready to Fit").map((p: any) => p.id),
              )
            }
          >
            <CalendarClock className="w-4 h-4" /> Tell customer parts arrived
          </Button>
        )}

        {history.length > 0 && (
          <div className="pt-1 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              History ({history.length})
            </p>
            {history.map((part: any) => {
              const sCfg = PART_STATUS_CONFIG[part.status] || PART_STATUS_CONFIG.Cancelled;
              return (
                <div key={part.id} className="rounded-lg bg-background/70 border border-border/60 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${part.status === "Cancelled" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {part.quantity > 1 ? `${part.quantity} × ` : ""}{part.description}
                    </p>
                    <span className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sCfg.bg} ${sCfg.text}`}>
                      <PartStatusIcon status={part.status} className="w-3 h-3" strokeWidth={2.5} />
                      {sCfg.label}
                    </span>
                  </div>
                  <PartStatusTrail row={part} />
                  <PartTrackingDetails row={part} />
                  <PartCommentsThread
                    partsRequestId={part.id}
                    organisationId={part.organisation_id || job.organisation_id}
                    authorName={engineerName || user?.email || null}
                    authorRole={role}
                    className="pt-2 border-t border-border/60"
                  />
                </div>
              );
            })}
          </div>
        )}

        {editingPart && (
          <PartTrackingEditSheet
            open={!!editingPart}
            onClose={() => setEditingPart(null)}
            part={editingPart}
            onSaved={() => refetch()}
          />
        )}
      </CardContent>
    </Card>

  );
};

const PartsNeededNoteBlock = ({ jobId }: { jobId: string }) => {
  const { data: parts = [] } = useJobParts(jobId);
  const active = parts.filter((p: any) => p.status !== "Cancelled");
  if (active.length === 0) return null;
  return (
    <div>
      <span className="text-sm font-bold text-amber-600">Parts Needed</span>
      {active.map((part: any) => (
        <div key={part.id} className="mt-0.5">
          <p className="text-sm font-semibold">
            {part.quantity > 1 ? `${part.quantity} × ` : ""}{part.description}
            <span className="text-xs font-normal text-muted-foreground"> · {part.status}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Logged by {part.logged_by_name || "Engineer"} · {fmtPartsLoggedAt(part.created_at)}
          </p>
        </div>
      ))}
    </div>
  );
};

const JobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<ServiceCall | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [partsNeededOpen, setPartsNeededOpen] = useState(false);
  const [partsArrivedOpen, setPartsArrivedOpen] = useState(false);
  // BJ-0071 — parts the "parts arrived" WhatsApp covers, so the send stamps
  // customer_notified_* on each one.
  const [arrivedPartIds, setArrivedPartIds] = useState<string[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [engineerNotes, setEngineerNotes] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [assignedEngineerAuth, setAssignedEngineerAuth] = useState<string | null>(null);
  const [assignedEngineerRgi, setAssignedEngineerRgi] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<{ cert_number: string; pdf_url: string | null; created_at: string } | null>(null);

  // Fetch assigned engineer's auth_user_id for messaging
  useEffect(() => {
    if (job?.assigned_engineer_id) {
      supabase.from("engineers").select("auth_user_id, rgi_number").eq("id", job.assigned_engineer_id).maybeSingle().then(({ data }) => {
        setAssignedEngineerAuth(data?.auth_user_id || null);
        setAssignedEngineerRgi((data as any)?.rgi_number || null);
      });
    }
  }, [job?.assigned_engineer_id]);

  useEffect(() => {
    if (user && id) {
      fetchJob();
      supabase.from("certificates").select("cert_number, pdf_url, created_at").eq("job_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        if (data) setCertificate(data);
      });
    }
  }, [user, id]);

  // Realtime: refetch job when service_call row changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`job-detail-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_calls", filter: `id=eq.${id}` }, () => {
        fetchJob();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    if (user) {
      supabase.from("engineers").select("id, name").eq("status", "active").then(({ data }) => {
        if (data) setEngineers(data);
      });
    }
  }, [user]);

  const fetchJob = async () => {
    setLoading(true);
    const { data: jobData, error } = await supabase
      .from("service_calls")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !jobData) {
      toast({ title: "Job not found", variant: "destructive" });
      navigate("/dashboard");
      return;
    }

    setJob(jobData as ServiceCall);

    const { data: custData } = await supabase
      .from("customers")
      .select("id, name, phone, email, address, eircode, area_code, gprn, access_notes, boiler_make_model, boiler_location")
      .eq("id", jobData.customer_id)
      .maybeSingle();

    if (custData) setCustomer(custData as Customer);
    setLoading(false);
  };

  const handleMarkComplete = async () => {
    if (!job) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({ status: "Completed", completed_at: new Date().toISOString(), notes: engineerNotes || job.notes } as any))
      .eq("id", job.id);
    setActionLoading(false);
    console.log("Mark complete result:", error);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_completed", entity_type: "service_call", entity_id: job.id, detail: "Job marked complete from admin detail" });
      toast({ title: "Job marked complete ✅" });
      setCompleteOpen(false);
      fetchJob();
    }
  };

  const handleReschedule = async () => {
    if (!job || !rescheduleDate) return;
    setActionLoading(true);
    const patch: Record<string, any> = { scheduled_date: rescheduleDate, time_block: rescheduleTime || null };
    if (job.status === "parts_needed" || job.status === "parts_ordered") {
      patch.status = "Scheduled";
    }
    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload(patch as any))
      .eq("id", job.id);
    setActionLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_rescheduled", entity_type: "service_call", entity_id: job.id, detail: `Rescheduled to ${rescheduleDate} ${rescheduleTime || ""}`.trim() });
      toast({ title: "Job rescheduled" });
      setRescheduleOpen(false);
      fetchJob();
    }
  };

  const handleCancel = async (reason: string, note: string) => {
    if (!job) return;
    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({
        status: "Cancelled",
        cancellation_reason: reason,
        cancellation_note: note || null,
        cancelled_at: new Date().toISOString(),
        cancelled_by: user?.id || null,
      } as any))
      .eq("id", job.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_cancelled", entity_type: "service_call", entity_id: job.id, detail: `Cancelled: ${reason}`, metadata: { reason, note } });
      supabase.functions.invoke('cancel-job-notify', {
        body: {
          service_call_id: job.id,
          cancellation_reason: reason,
        },
      }).catch((err) => console.error('cancel-job-notify failed:', err));
      supabase.functions.invoke('send-cancellation-notice', {
        body: { service_call_id: job.id },
      }).catch((err) => console.error('send-cancellation-notice failed:', err));
      toast({ title: "Job cancelled" });
      setCancelOpen(false);
      fetchJob();
    }
  };

  const handleReassignEngineer = async (engineerId: string) => {
    if (!job) return;
    const engineer = engineers.find(e => e.id === engineerId);
    if (!engineer) return;
    setReassignLoading(true);
    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({
        assigned_engineer_id: engineerId,
        assigned_engineer: engineer.name,
      } as any))
      .eq("id", job.id);
    setReassignLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({
        action_type: "job_reassigned",
        entity_type: "service_call",
        entity_id: job.id,
        detail: `Reassigned to ${engineer.name}`,
        metadata: { new_engineer: engineer.name, old_engineer: job.assigned_engineer },
      });
      // Reassigning engineer on an existing job — send booking confirmation
      supabase.functions.invoke('send-booking-confirmation', {
        body: { service_call_id: job.id }
      }).catch(err => console.error('Booking confirmation failed:', err));
      toast({ title: `Reassigned to ${engineer.name}` });
      fetchJob();
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!job || !customer) return null;

  const showQuotePanel = job.job_type === "Repair" || job.job_type === "Emergency";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Follow-up Banner */}
      {(job as any).follow_up_needed && !(job as any).follow_up_resolved && (
        <div className="flex items-start gap-2 rounded-lg p-3 bg-amber-500/10 border-l-4 border-amber-500">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-amber-800">
            ⚠️ Follow-up required: {(job as any).follow_up_detail || "Details not specified"}
          </p>
        </div>
      )}

      {/* Parts section — permanent (BJ-0069): renders whenever the job has any
          parts request, regardless of job status. Self-hides when there are none. */}
      <PartsNeededSection job={job} onStatusChange={fetchJob} onPartsArrived={(ids) => { setArrivedPartIds(ids); setPartsArrivedOpen(true); }} />


      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${customer.id}`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <button
            onClick={() => navigate(`/customers/${customer.id}`)}
            className="text-xl font-bold hover:text-primary transition-colors text-left"
          >
            {customer.name}
          </button>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {jobTypeBadge(job.job_type)}
            {statusBadge(job.status)}
            <JobConfirmedBadge confirmed={(job as any).confirmed} confirmedAt={(job as any).confirmed_at} status={(job as any).status} />
            <NewCustomerBadge status={(job as any).customer_status_at_booking} />
            {job.status === "Completed" && job.payment_method && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-success/10 text-success">
                ✅ Paid
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDateIE(job.scheduled_date)} · {job.time_block || "No time"} · {job.assigned_engineer || "Unassigned"}
          </p>
          {job.status === "Completed" && job.completed_at && (
            <p className="text-sm text-success mt-0.5 font-semibold">
              Completed {new Date(job.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {new Date(job.completed_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`/customers/${customer.id}`)}>
          <User className="w-4 h-4 mr-1" /> Profile
        </Button>
      </div>

      {/* Job Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Job Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Customer:</span> <span className="font-semibold">{customer.name}</span></div>
            <div>
              <span className="text-muted-foreground">Phone:</span>{" "}
              <a href={`tel:${customer.phone}`} className="font-semibold text-primary underline">{customer.phone}</a>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="font-semibold text-primary underline">{customer.email}</a>
              ) : (
                <span className="font-semibold">—</span>
              )}
            </div>
            <div><span className="text-muted-foreground">Area Code:</span> <span className="font-semibold">{customer.area_code || "—"}</span></div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-semibold">{customer.address}</span></div>
            <div><span className="text-muted-foreground">Eircode:</span> <span className="font-semibold">{customer.eircode}</span></div>
            <div><span className="text-muted-foreground">GPRN:</span> <span className="font-semibold">{customer.gprn || "—"}</span></div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Engineer:</span>
              {!["Completed", "Cancelled"].includes(job.status) ? (
                <Select
                  value={job.assigned_engineer_id || "unassigned"}
                  onValueChange={(val) => {
                    if (val !== "unassigned") handleReassignEngineer(val);
                  }}
                  disabled={reassignLoading}
                >
                  <SelectTrigger className="h-8 w-[180px] text-sm font-semibold">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="unassigned" disabled>Unassigned</SelectItem>
                    {engineers.map((eng) => (
                      <SelectItem key={eng.id} value={eng.id}>{eng.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-semibold">{job.assigned_engineer || "—"}</span>
              )}
              {reassignLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div><span className="text-muted-foreground">Time Block:</span> <span className="font-semibold">{job.time_block || "—"}</span></div>
            {/* Boiler fields */}
            {job.boiler_brand && (
              <div><span className="text-muted-foreground">Boiler Brand:</span> <span className="font-semibold">{job.boiler_brand}</span></div>
            )}
            {customer.boiler_make_model && (
              <div><span className="text-muted-foreground">Boiler Model:</span> <span className="font-semibold">{customer.boiler_make_model}</span></div>
            )}
            {customer.boiler_location?.trim() && (
              <div><span className="text-muted-foreground">Boiler Location:</span> <span className="font-semibold">{customer.boiler_location}</span></div>
            )}
            {(job as any).job_issue && (
              <div className="sm:col-span-2"><span className="text-muted-foreground">Job Issue:</span> <span className="font-semibold">{(job as any).job_issue}</span></div>
            )}
            {customer.access_notes && (
              <div className="sm:col-span-2"><span className="text-muted-foreground">Access Notes:</span> <span className="font-semibold">{customer.access_notes}</span></div>
            )}
            {(job as any).access_notes && (
              <div className="sm:col-span-2"><span className="text-muted-foreground">Job Access Notes:</span> <span className="font-semibold">{(job as any).access_notes}</span></div>
            )}
            {job.notes && (
              <div className="sm:col-span-2">
                {job.notes.startsWith("Parts Needed") ? (
                  <PartsNeededNoteBlock jobId={job.id} />
                ) : (
                  <><span className="text-muted-foreground">Notes:</span> <span className="font-semibold">{job.notes}</span></>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      {job.deposit_required && (job.deposit_amount ?? 0) > 0 && (
        <Card className="border-l-4 border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary" /> Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Job Total</span>
                <p className="text-lg font-extrabold text-foreground mt-0.5">€{(job.revenue ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Deposit {job.deposit_paid ? "Paid" : "Required"}</span>
                <p className={`text-lg font-extrabold mt-0.5 ${job.deposit_paid ? "text-success" : "text-warning"}`}>
                  €{(job.deposit_amount ?? 0).toFixed(2)}
                  {job.deposit_paid && <span className="ml-1 text-sm">✅</span>}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Balance Due</span>
                <p className={`text-lg font-extrabold mt-0.5 ${(job.balance_due ?? 0) > 0 ? "text-amber-600" : "text-success"}`}>
                  €{(job.balance_due ?? ((job.revenue ?? 0) - (job.deposit_amount ?? 0))).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${job.deposit_required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                Deposit Required
              </span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                job.payment_status === "paid" ? "bg-success/10 text-success" :
                job.deposit_paid ? "bg-warning/10 text-warning" :
                "bg-muted text-muted-foreground"
              }`}>
                {job.payment_status === "paid" ? "Fully Paid" : job.deposit_paid ? "Deposit Paid — Balance Due" : "Unpaid"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <JobMessageThread jobId={job.id} perspective="office" />
          <InlineOfficeReply jobId={job.id} engineerAuthUserId={assignedEngineerAuth} />
        </CardContent>
      </Card>

      {job.customer_id && (
        <WhatsAppHistory
          customerId={job.customer_id}
          highlightJobId={job.id}
          hideSendButton
          title="Customer Messages"
        />
      )}


      {/* Take Payment — completed but unpaid */}
      {job.status === "Completed" && !job.payment_method && (
        <Button
          className="w-full h-14 text-base font-extrabold gap-2 bg-primary hover:bg-primary/90"
          onClick={() => setPaymentOpen(true)}
        >
          <CreditCard className="w-5 h-5" /> Take Payment
        </Button>
      )}

      {/* Boiler Issue Warning */}
      {job.boiler_working === false && job.boiler_issue && (
        <div className="flex items-start gap-2 rounded-lg p-3 bg-warning/10 border-l-4 border-warning">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Boiler not working</p>
            <p className="text-sm">{job.boiler_issue}</p>
            {job.boiler_brand && <p className="text-xs text-muted-foreground mt-1">Brand: {job.boiler_brand}</p>}
          </div>
        </div>
      )}

      {/* Cancellation Details */}
      {job.status === "Cancelled" && job.cancellation_reason && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" /> Cancellation Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Reason:</span> <span className="font-semibold">{job.cancellation_reason}</span></div>
            {job.cancellation_note && (
              <div><span className="text-muted-foreground">Note:</span> <span className="font-semibold">{job.cancellation_note}</span></div>
            )}
            {job.cancelled_at && (
              <div><span className="text-muted-foreground">Cancelled:</span> <span className="font-semibold">{new Date(job.cancelled_at).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
            )}
            {job.deposit_paid && (
              <div className="flex items-center gap-1.5 mt-1 text-warning font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Payment was recorded — refund may be required
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Details */}
      {job.status === "Completed" && (job as any).payment_method && (
        <Card className="border-success/30 bg-success/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-success">
              {(job as any).payment_method === "cash" ? <Banknote className="w-4 h-4" /> :
               (job as any).payment_method === "card" ? <CreditCard className="w-4 h-4" /> :
               <FileText className="w-4 h-4" />}
              Payment Collected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Method:</span>{" "}
              <span className="font-semibold capitalize">{(job as any).payment_method === "invoice" ? "Invoice Required" : (job as any).payment_method}</span>
            </div>
            {(job as any).paid_at && (
              <div>
                <span className="text-muted-foreground">Collected:</span>{" "}
                <span className="font-semibold">{new Date((job as any).paid_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* View Certificate */}
      {job.status === "Completed" && certificate && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-extrabold">{certificate.cert_number}</div>
                <div className="text-xs text-muted-foreground">{new Date(certificate.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</div>
              </div>
            </div>
            {certificate.pdf_url ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(certificate.pdf_url!, "_blank")}>
                <ExternalLink className="w-3.5 h-3.5" /> View Certificate
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">PDF pending…</span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gas Installation / New Meter Certs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Gas Installation / New Meter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <JobCertsTab job={job} customer={customer} engineerInfo={{ name: job.assigned_engineer || "", rgi_number: assignedEngineerRgi }} />
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            📷 Customer Photos & Videos
            {job.source === "Tally Form" && <span className="text-xs font-normal text-muted-foreground">· Submitted with booking</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediaGallery jobId={job.id} showUpload onUpload={() => {}} />
        </CardContent>
      </Card>

      {/* Quote Panel */}
      {showQuotePanel && (
        <QuotePanel jobId={job.id} customerId={customer.id} customer={customer} onQuoteChange={fetchJob} />
      )}

      {/* Extra Work Pending Approval */}
      <ExtraWorkPendingCard jobId={job.id} onQuoteChange={fetchJob} />

      {/* Job Status Actions */}
      {job.status === "Scheduled" && (
        <Card>
          <CardContent className="pt-6">
            <Button
              className="w-full h-[48px] font-bold gap-2"
              onClick={async () => {
                setActionLoading(true);
                const { data: startData, error: startError } = await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ status: "In Progress" } as any)).eq("id", job.id).select();
                console.log("Status update result:", startData, startError);
                if (startError) {
                  toast({ title: "Error", description: startError.message, variant: "destructive" });
                } else {
                  logAudit({ action_type: "job_started", entity_type: "service_call", entity_id: job.id, detail: "Job started from admin detail" });
                  toast({ title: "Job started" });
                }
                setActionLoading(false);
                fetchJob();
              }}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start Job
            </Button>
          </CardContent>
        </Card>
      )}

      {job.status === "In Progress" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Job Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => setCompleteOpen(true)}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Complete
            </Button>
            <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => setNoShowOpen(true)}>
              <Ban className="w-4 h-4 mr-1" /> No Access
            </Button>
            <Button variant="outline" className="text-amber-500 border-amber-500/30" onClick={() => setPartsNeededOpen(true)}>
              <Wrench className="w-4 h-4 mr-1" /> Parts Needed
            </Button>
          </CardContent>
        </Card>
      )}

      {/* General Admin Actions */}
      {!["Completed", "Cancelled", "no_show", "parts_needed"].includes(job.status) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => {
              setRescheduleDate(job.scheduled_date || "");
              setRescheduleTime(job.time_block || "");
              setRescheduleOpen(true);
            }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Reschedule
            </Button>
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="w-4 h-4 mr-1" /> Cancel Job
            </Button>
            {job.assigned_engineer_id && (
              <Button
                className="text-white font-bold"
                style={{ backgroundColor: "#4A86E8" }}
                onClick={() => setMessageOpen(true)}
              >
                📩 Message Engineer
              </Button>
            )}
          </CardContent>
        </Card>
      )}



      {/* Mark Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Job Complete</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Engineer Notes (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={engineerNotes}
                onChange={(e) => setEngineerNotes(e.target.value)}
                placeholder="Any notes from the job..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
              <Button onClick={handleMarkComplete} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Complete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New Date</Label>
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Time Block</Label>
              <Select value={rescheduleTime} onValueChange={setRescheduleTime}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Midday">Midday</SelectItem>
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
              <Button onClick={handleReschedule} disabled={actionLoading || !rescheduleDate}>
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Reschedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Cancel Job Modal */}
      <CancelJobModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        jobRef={(job as any).job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`}
        depositPaid={job.deposit_paid}
        onConfirm={handleCancel}
      />
      <NoShowSheet
        open={noShowOpen}
        onClose={() => setNoShowOpen(false)}
        loading={actionLoading}
        onConfirm={async (reason, notes) => {
          setActionLoading(true);
          await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ status: "no_show", notes: `No Show: ${reason}${notes ? ` — ${notes}` : ""}` } as any)).eq("id", job.id);
          logAudit({ action_type: "job_no_show", entity_type: "service_call", entity_id: job.id, detail: `No show: ${reason}`, metadata: { reason, notes } });
          toast({ title: "Job marked as No Show" });
          setActionLoading(false);
          setNoShowOpen(false);
          fetchJob();
        }}
      />
      <PartsNeededSheet
        open={partsNeededOpen}
        onClose={() => setPartsNeededOpen(false)}
        loading={actionLoading}
        onConfirm={async (part) => {
          setActionLoading(true);
          // Office-logged parts go straight into parts_requests. The DB trigger
          // (recompute_job_parts_status) moves the job to parts_needed — we must
          // never write the part into service_calls.notes.
          const assignedEngineerId = (job as any).assigned_engineer_id ?? null;
          let engineerUserId: string | null = null;
          if (assignedEngineerId) {
            const { data: eng } = await supabase
              .from("engineers")
              .select("user_id")
              .eq("id", assignedEngineerId)
              .maybeSingle();
            engineerUserId = (eng as any)?.user_id ?? null;
          }
          let officeName: string | null = null;
          if (user?.id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("user_id", user.id)
              .maybeSingle();
            officeName = (prof as any)?.display_name ?? null;
          }
          const { error } = await insertPartsRequest({
            part,
            organisationId: (job as any).organisation_id,
            serviceCallId: job.id,
            customerId: job.customer_id,
            loggedBy: user?.id ?? null,
            loggedByName: officeName || "Office",
            assignedTo: assignedEngineerId,
            engineerId: engineerUserId,
          });
          setActionLoading(false);
          if (error) {
            toast({ title: "Couldn't save part", description: error.message, variant: "destructive" });
            return;
          }
          await supabase
            .from("service_calls")
            .update({ parts_priority: part.priority, parts_logged_at: new Date().toISOString() } as any)
            .eq("id", job.id);
          logAudit({
            action_type: "job_parts_needed",
            entity_type: "service_call",
            entity_id: job.id,
            detail: `Part logged: ${part.description}`,
            metadata: { description: part.description, priority: part.priority, quantity: part.quantity ?? 1 },
          });
          toast({ title: "Part logged", description: "Added to the parts list" });
          setPartsNeededOpen(false);
          fetchJob();
        }}

      />
      {/* Take Payment Modal */}
      {paymentOpen && customer && (
        <TakePaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          job={job}
          customer={customer}
          onPaymentComplete={() => fetchJob()}
        />
      )}
      {/* Message Engineer Modal */}
      <MessageEngineerModal
        open={messageOpen}
        onOpenChange={setMessageOpen}
        jobId={job.id}
        engineerName={job.assigned_engineer || "Engineer"}
        engineerAuthUserId={assignedEngineerAuth}
      />
      {/* Parts Arrived Modal */}
      {partsArrivedOpen && customer && (
        <PartsArrivedModal
          open={partsArrivedOpen}
          onClose={() => setPartsArrivedOpen(false)}
          jobId={job.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          followUpDetail={(job as any).follow_up_detail}
          partsRequestIds={arrivedPartIds}
          onSent={fetchJob}
        />
      )}
    </div>
  );
};

export default JobDetail;
