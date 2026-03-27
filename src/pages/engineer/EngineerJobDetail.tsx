import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, MapPin, MessageCircle, StickyNote, Camera, Loader2, Calendar, Wrench, Clock, Flame, CreditCard, Hourglass, AlertTriangle, FileText, Key, XCircle, CheckCircle2, Play, Plus, PhoneCall, Send, Eye, Package } from "lucide-react";
import CompleteSheet from "@/components/engineer/CompleteSheet";
import CertificateFlow from "@/components/engineer/CertificateFlow";
import HazardNotificationFlow from "@/components/engineer/HazardNotificationFlow";
import CancelSheet from "@/components/engineer/CancelSheet";
import NoteSheet from "@/components/engineer/NoteSheet";
import PhotoSheet from "@/components/engineer/PhotoSheet";
import ExtraWorkSheet from "@/components/engineer/ExtraWorkSheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:     { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:        { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
  "In Progress": { color: "text-warning",     bg: "bg-warning/10",     label: "In Progress" },
  Completed:     { color: "text-success",     bg: "bg-success/10",     label: "Completed" },
  Cancelled:     { color: "text-destructive", bg: "bg-destructive/10", label: "Cancelled" },
  parts_needed:  { color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Parts Needed" },
  parts_ordered: { color: "text-blue-600",    bg: "bg-blue-100",       label: "Parts Ordered" },
};

const TIME_LABELS: Record<string, string> = {
  "9–11": "9–11am",
  "11–2": "11am–1pm",
  "2–5":  "2–5pm",
};

const getJobRef = (id: string) => `BJ-${id.slice(0, 6).toUpperCase()}`;

const InfoTile = ({ label, value, Icon, full }: { label: string; value: string | null; Icon?: LucideIcon; full?: boolean }) => (
  <div className={`bg-secondary rounded-xl border border-border p-3 ${full ? "col-span-2" : ""}`}>
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />}{label}
    </div>
    <div className="text-[13px] font-bold text-foreground leading-snug">{value || "—"}</div>
  </div>
);

interface EngineerJobDetailProps {}

const EngineerJobDetail: React.FC<EngineerJobDetailProps> = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [callNotes, setCallNotes] = useState<any[]>([]);
  const [jobTags, setJobTags] = useState<{ name: string; colour: string }[]>([]);
  const [certificate, setCertificate] = useState<{ id: string; pdf_url: string | null; cert_number: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showHazard, setShowHazard] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [replyNote, setReplyNote] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [engineerInfo, setEngineerInfo] = useState<{ name: string; rgi_number: string | null }>({ name: "", rgi_number: null });

  useEffect(() => {
    if (user && id) fetchJob();
  }, [user, id]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("engineers")
      .select("name, rgi_number")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEngineerInfo({ name: data.name, rgi_number: (data as any).rgi_number || null });
      });
  }, [user]);

  const fetchJob = async () => {
    setLoading(true);
    const { data: jobData } = await supabase
      .from("service_calls")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!jobData) {
      toast({ title: "Job not found", variant: "destructive" });
      navigate("/engineer/today");
      return;
    }

    setJob(jobData);

    const [custRes, notesRes, certRes, tagsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", jobData.customer_id).maybeSingle(),
      supabase.from("customer_call_notes").select("*").eq("customer_id", jobData.customer_id).order("created_at", { ascending: false }),
      supabase.from("certificates").select("id, pdf_url, cert_number").eq("job_id", id).maybeSingle(),
      supabase.from("service_call_tags").select("tag_id, job_tags(name, colour)").eq("service_call_id", id!),
    ]);

    if (custRes.data) setCustomer(custRes.data);
    if (notesRes.data) setCallNotes(notesRes.data);
    setCertificate(certRes.data || null);
    setJobTags((tagsRes.data || []).map((r: any) => ({ name: r.job_tags?.name, colour: r.job_tags?.colour })).filter((t: any) => t.name));
    setLoading(false);
  };

  const handleSaveReply = async () => {
    if (!replyNote.trim() || !user || !customer) return;
    setSavingReply(true);
    const { error } = await supabase.from("customer_call_notes").insert({
      customer_id: customer.id,
      user_id: user.id,
      note: replyNote.trim(),
      created_by_name: job?.assigned_engineer || user.email?.split("@")[0] || "Engineer",
    });
    setSavingReply(false);
    if (error) {
      toast({ title: "Error saving note", description: error.message, variant: "destructive" });
    } else {
      setReplyNote("");
      const { data } = await supabase
        .from("customer_call_notes")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      if (data) setCallNotes(data);
      toast({ title: "Note saved" });
    }
  };

  const updateJob = async (patch: Record<string, any>) => {
    if (!job) return;
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, cancelReason, cancelNote, paymentMethod, selectedTags, ...rest } = patch;

    let notesUpdate = rest.notes;
    if (workDone) {
      notesUpdate = `Work done: ${workDone}${parts ? `\nParts: ${parts}` : ""}${officeNote ? `\nOffice note: ${officeNote}` : ""}${followUp ? `\nFollow-up: ${followUpNote}` : ""}`;
    }

    // Wire follow-up toggle to dedicated columns
    if (workDone !== undefined) {
      rest.follow_up_needed = !!followUp;
      rest.follow_up_detail = followUp ? (followUpNote || null) : null;
    }

    if (cancelReason) {
      notesUpdate = `Cancelled: ${cancelReason}${cancelNote ? `\nNote: ${cancelNote}` : ""}`;
    }

    const dbPatch: Record<string, any> = { ...rest };
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    if (paymentMethod) {
      dbPatch.payment_method = paymentMethod;
      dbPatch.paid_at = new Date().toISOString();
      dbPatch.payment_collected_by = user?.id || null;
    }
    if (cancelReason) {
      dbPatch.cancellation_reason = cancelReason;
      dbPatch.cancellation_note = cancelNote || null;
      dbPatch.cancelled_at = new Date().toISOString();
      dbPatch.cancelled_by = user?.id || null;
    }

    // Set completed_at and generate receipt number on completion
    if (patch.status === "Completed") {
      dbPatch.completed_at = new Date().toISOString();
      if (paymentMethod === "invoice") {
        dbPatch.invoiced_at = new Date().toISOString();
      }
      if (!job.receipt_number) {
        try {
          const { data: receiptNum, error: rpcErr } = await supabase.rpc("generate_receipt_number", { p_user_id: job.user_id });
          if (!rpcErr && receiptNum) {
            dbPatch.receipt_number = receiptNum;
          }
        } catch {}
      }
    }

    const { error } = await supabase.from("service_calls").update(dbPatch).eq("id", job.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Save selected tags on completion
      if (patch.status === "Completed" && selectedTags && selectedTags.length > 0) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_id", user!.id)
            .maybeSingle();

          const profileId = profile?.id || null;

          const { data: tagRows } = await supabase
            .from("job_tags")
            .select("id, name")
            .in("name", selectedTags);

          if (tagRows && tagRows.length > 0) {
            const { data: existing } = await supabase
              .from("service_call_tags")
              .select("tag_id")
              .eq("service_call_id", job.id);

            const existingIds = new Set((existing || []).map((e: any) => e.tag_id));

            const inserts = tagRows
              .filter((t: any) => !existingIds.has(t.id))
              .map((t: any) => ({
                service_call_id: job.id,
                tag_id: t.id,
                added_by: profileId,
              }));

            if (inserts.length > 0) {
              await supabase.from("service_call_tags").insert(inserts as any);
            }
          }
        } catch (e) {
          console.error("Failed to save job tags:", e);
        }
      }

      if (patch.status === "Completed") {
        logAudit({ action_type: "job_completed", entity_type: "service_call", entity_id: job.id, detail: "Completed by engineer" });
        toast({ title: "Job completed" });
        navigate(`/receipt/${job.id}`);
        return;
      } else if (patch.status === "Cancelled") {
        logAudit({ action_type: "job_cancelled", entity_type: "service_call", entity_id: job.id, detail: `Cancelled by engineer: ${patch.cancelReason}`, metadata: { reason: patch.cancelReason, note: patch.cancelNote } });
      } else if (patch.status === "In Progress") {
        logAudit({ action_type: "job_started", entity_type: "service_call", entity_id: job.id, detail: "Job started by engineer" });
      }
      toast({ title: patch.status === "Cancelled" ? "Job cancelled" : "Updated" });
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
      .update(patch as any)
      .eq("id", job.id);
    setActionLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      logAudit({ action_type: "job_rescheduled", entity_type: "service_call", entity_id: job.id, detail: `Rescheduled by engineer to ${rescheduleDate} ${rescheduleTime || ""}`.trim() });
      toast({ title: "Job rescheduled" });
      setShowReschedule(false);
      fetchJob();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-[430px] mx-auto min-h-screen bg-secondary flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job || !customer) return null;

  const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.Scheduled;
  const isDone = job.status === "Completed" || job.status === "Cancelled";
  const timeLabel = TIME_LABELS[job.time_block] || job.time_block || "—";

  const openPhone = () => window.open(`tel:${customer.phone}`);
  const openWhatsApp = () => window.open(`https://wa.me/${customer.phone?.replace(/[^0-9]/g, "")}`, "_blank");
  const openNav = () =>
    window.open(`https://maps.google.com/?daddr=${encodeURIComponent(customer.address + " " + customer.eircode + " Ireland")}`, "_blank");

  // Limit reschedule to 14 days
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 14);
  const maxDateStr = maxDate.toISOString().split("T")[0];
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary pb-32">
      {/* Compact header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark px-4 pt-12 pb-5 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <button
          onClick={() => navigate("/engineer/today")}
          className="flex items-center gap-1.5 text-white/80 text-sm font-semibold mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] font-bold text-white/60 tracking-wider">{getJobRef(job.id)}</div>
            <div className="text-2xl font-extrabold text-white leading-tight">{customer.name}</div>
            <div className="text-[13px] text-white/70 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {customer.address}
            </div>
            {job.status === "Completed" && job.completed_at && (
              <div className="text-[13px] text-white/90 mt-1 font-semibold">
                Completed {new Date(job.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at {new Date(job.completed_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}
              </div>
            )}
          </div>
          <span className={`${s.bg} ${s.color} rounded-full px-3 py-1 text-xs font-bold shrink-0 ml-2 backdrop-blur-sm`}>
            {s.label}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Quick contact actions — large tap targets */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={openPhone}
            className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl py-4 active:scale-95 transition-transform"
          >
            <Phone className="w-6 h-6 text-primary" />
            <span className="text-xs font-bold text-foreground">Call</span>
          </button>
          <button
            onClick={openWhatsApp}
            className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl py-4 active:scale-95 transition-transform"
          >
            <MessageCircle className="w-6 h-6 text-success" />
            <span className="text-xs font-bold text-foreground">WhatsApp</span>
          </button>
          <button
            onClick={openNav}
            className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-2xl py-4 active:scale-95 transition-transform"
          >
            <MapPin className="w-6 h-6 text-primary" />
            <span className="text-xs font-bold text-foreground">Navigate</span>
          </button>
        </div>

        {/* Job details grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <InfoTile label="Job Type" value={job.job_type} Icon={Wrench} />
          <InfoTile label="Time Slot" value={timeLabel} Icon={Clock} />
          <InfoTile label="Boiler" value={customer.boiler_make_model || job.boiler_brand} Icon={Flame} full />
          <InfoTile
            label="Payment"
            value={job.deposit_paid ? `Paid — €${job.deposit_amount || 0}` : `€${job.deposit_amount || 0} pending`}
            Icon={job.deposit_paid ? CreditCard : Hourglass}
            full
          />
          <InfoTile label="Last Service" value={customer.last_service_date ? new Date(customer.last_service_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null} Icon={Calendar} />
          <InfoTile label="Last Engineer" value={customer.last_service_engineer} Icon={Wrench} />
        </div>

        {/* Parts Ordered banner */}
        {job.status === "parts_ordered" && (
          <div className="rounded-r-xl p-3 flex items-center gap-2.5" style={{ backgroundColor: "#EFF6FF", borderLeft: "3px solid #2563EB" }}>
            <Package className="w-4 h-4 shrink-0" style={{ color: "#2563EB" }} />
            <div>
              <div className="text-[13px] font-bold" style={{ color: "#2563EB" }}>Parts Ordered</div>
              <div className="text-[11px] text-muted-foreground">Office is sourcing your parts</div>
            </div>
          </div>
        )}

        {/* Parts Needed banner */}
        {job.status === "parts_needed" && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-xl p-3 flex items-center gap-2.5">
            <Wrench className="w-4 h-4 text-warning shrink-0" />
            <div>
              <div className="text-[13px] font-bold text-warning">Parts Needed</div>
              <div className="text-[11px] text-muted-foreground">Waiting for office to order parts</div>
            </div>
          </div>
        )}

        {/* Boiler issue */}
        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-xl p-3">
            <div className="text-[11px] font-bold text-warning uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Issue Reported
            </div>
            <div className="text-[13px] text-foreground leading-snug">{job.boiler_issue}</div>
          </div>
        )}

        {/* Notes */}
        {job.notes && (
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Notes
            </div>
            <div className="text-[13px] text-foreground whitespace-pre-wrap">{job.notes}</div>
          </div>
        )}

        {/* Job Tags */}
        {jobTags.length > 0 && (
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Job Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {jobTags.map((tag) => (
                <span
                  key={tag.name}
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: tag.colour }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Access notes */}
        {customer.access_notes && (
          <div className="bg-primary/5 rounded-xl border border-primary/10 p-3">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <Key className="w-3 h-3" /> Access Note
            </div>
            <div className="text-[13px] text-foreground">{customer.access_notes}</div>
          </div>
        )}

        {/* Call Notes + Engineer Reply */}
        <div className="bg-secondary rounded-xl border border-border p-3 space-y-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <PhoneCall className="w-3 h-3" /> Call Notes
          </div>
          {callNotes.length > 0 ? callNotes.map((cn) => (
            <div key={cn.id} className="bg-card rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-semibold text-foreground">{cn.created_by_name || "Office"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(cn.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <p className="text-[13px] text-foreground leading-snug">{cn.note}</p>
            </div>
          )) : (
            <p className="text-xs text-muted-foreground">No notes yet</p>
          )}
          {/* Engineer reply input */}
          <div className="flex gap-2 pt-1">
            <Input
              value={replyNote}
              onChange={(e) => setReplyNote(e.target.value)}
              placeholder="Add a note from site…"
              className="text-sm h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && replyNote.trim()) {
                  e.preventDefault();
                  handleSaveReply();
                }
              }}
            />
            <Button
              size="sm"
              className="shrink-0 h-9"
              disabled={!replyNote.trim() || savingReply}
              onClick={handleSaveReply}
            >
              {savingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Cancellation details */}
        {job.status === "Cancelled" && job.cancellation_reason && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
            <div className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Cancelled
            </div>
            <div className="text-[13px] text-foreground font-semibold">{job.cancellation_reason}</div>
            {job.cancellation_note && (
              <div className="text-[13px] text-muted-foreground mt-0.5">{job.cancellation_note}</div>
            )}
            {job.cancelled_at && (
              <div className="text-[11px] text-muted-foreground mt-1">
                {new Date(job.cancelled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>
        )}

        {/* Secondary actions */}
        {!isDone && (
          <div className="grid grid-cols-3 gap-2.5">
            <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 text-xs font-bold" onClick={() => setShowNote(true)}>
              <StickyNote className="w-5 h-5" /> Add Note
            </Button>
            <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 text-xs font-bold" onClick={() => setShowPhotos(true)}>
              <Camera className="w-5 h-5" /> Photo
            </Button>
            <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 text-xs font-bold" onClick={() => setShowExtraWork(true)}>
              <Plus className="w-5 h-5" /> Extra Work
            </Button>
          </div>
        )}

        {/* Primary actions */}
        {(job.status === "Scheduled" || job.status === "Booked") && (
          <div className="space-y-2.5">
            <Button
              className="w-full h-14 text-lg font-extrabold gap-2"
              onClick={() => updateJob({ status: "In Progress" })}
            >
              <Play className="w-5 h-5" /> Start Job
            </Button>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1 h-12 font-bold gap-1.5"
                onClick={() => {
                  setRescheduleDate(job.scheduled_date || "");
                  setRescheduleTime(job.time_block || "");
                  setShowReschedule(true);
                }}
              >
                <Calendar className="w-4 h-4" /> Reschedule
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-12 font-bold text-destructive border-destructive/30 gap-1.5"
                onClick={() => setShowCancel(true)}
              >
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {job.status === "In Progress" && (
          <div className="space-y-2.5">
            <Button
              className="w-full h-14 text-lg font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setShowComplete(true)}
            >
              <CheckCircle2 className="w-5 h-5" /> Complete Job
            </Button>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1 h-12 font-bold gap-1.5"
                onClick={() => {
                  setRescheduleDate(job.scheduled_date || "");
                  setRescheduleTime(job.time_block || "");
                  setShowReschedule(true);
                }}
              >
                <Calendar className="w-4 h-4" /> Reschedule
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-12 font-bold text-destructive border-destructive/30 gap-1.5"
                onClick={() => setShowCancel(true)}
              >
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {job.status === "Completed" && (
          <div className="space-y-3">
            <div className="bg-success/10 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-success" />
              <div>
                <div className="text-sm font-extrabold text-success">Job Completed</div>
                {job.updated_at && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(job.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                )}
              </div>
            </div>
            
            {certificate?.pdf_url ? (
              <Button
                className="w-full h-14 text-lg font-extrabold gap-2 text-white bg-success hover:bg-success/90"
                onClick={() => window.open(certificate.pdf_url!, "_blank")}
              >
                <Eye className="w-5 h-5" /> View Certificate{certificate.cert_number ? ` — ${certificate.cert_number}` : ""}
              </Button>
            ) : (
              <Button
                className="w-full h-14 text-lg font-extrabold gap-2 text-white"
                style={{ backgroundColor: "#1e3a5f" }}
                onClick={() => setShowCertificate(true)}
              >
                <FileText className="w-5 h-5" /> Generate Certificate
              </Button>
            )}
            <Button
              className="w-full h-14 text-lg font-extrabold gap-2 text-white"
              style={{ backgroundColor: "#1e3a5f" }}
              onClick={() => setShowHazard(true)}
            >
              <AlertTriangle className="w-5 h-5" /> Notification of Hazard
            </Button>
          </div>
        )}
      </div>

      {/* Sheets */}
      {showComplete && (
        <CompleteSheet
          job={job}
          customer={customer}
          onClose={() => setShowComplete(false)}
          onDone={(data: any) => { updateJob({ status: "Completed", ...data }); setShowComplete(false); }}
        />
      )}
      {showCancel && (
        <CancelSheet
          job={job}
          customer={customer}
          onClose={() => setShowCancel(false)}
          onDone={(reason: string, note: string) => { updateJob({ status: "Cancelled", cancelReason: reason, cancelNote: note }); setShowCancel(false); }}
        />
      )}
      {showNote && (
        <NoteSheet
          job={job}
          customer={customer}
          onClose={() => setShowNote(false)}
          onSave={(note: string) => { updateJob({ notes: note }); setShowNote(false); }}
        />
      )}
      {showPhotos && (
        <PhotoSheet
          job={job}
          customer={customer}
          onClose={() => setShowPhotos(false)}
          onSave={() => setShowPhotos(false)}
        />
      )}
      {showExtraWork && (
        <ExtraWorkSheet
          job={job}
          customer={customer}
          onClose={() => setShowExtraWork(false)}
        />
      )}
      {showCertificate && (
        <CertificateFlow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowCertificate(false); fetchJob(); }}
        />
      )}

      {/* Reschedule Dialog */}
      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Reschedule Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Date</Label>
              <Input type="date" value={rescheduleDate} min={todayStr} max={maxDateStr} onChange={(e) => setRescheduleDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Block</Label>
              <Select value={rescheduleTime} onValueChange={setRescheduleTime}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select time" /></SelectTrigger>
                <SelectContent className="bg-popover z-[600]">
                  <SelectItem value="9–11">9–11am</SelectItem>
                  <SelectItem value="11–2">11am–2pm</SelectItem>
                  <SelectItem value="2–5">2–5pm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full h-12 font-extrabold" disabled={!rescheduleDate || actionLoading} onClick={handleReschedule}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Confirm Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EngineerJobDetail;
