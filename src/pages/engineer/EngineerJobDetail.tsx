import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, MapPin, MessageCircle, StickyNote, Camera, Loader2, Calendar, Wrench, Clock, Flame, CreditCard, Hourglass, AlertTriangle, FileText, Key, XCircle, CheckCircle2, Play, Plus, PhoneCall, Send, Eye, Package, PackageCheck, Mail, MapPinned, UserPlus, RotateCw, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import { buildEngineerPaymentPlan, type EngineerLedgerRow } from "@/lib/engineerPaymentPlan";
import { resolveDepositPill } from "@/components/engineer/job-card/InfoPills";
import { createJobInvoice } from "@/lib/createJobInvoice";
import CompleteSheet from "@/components/engineer/CompleteSheet";
import PaymentSheet from "@/components/engineer/PaymentSheet";
import CancelSheet from "@/components/engineer/CancelSheet";
import NoteSheet from "@/components/engineer/NoteSheet";
import PhotoSheet from "@/components/engineer/PhotoSheet";
import ExtraWorkSheet from "@/components/engineer/ExtraWorkSheet";
import JobCertsTab from "@/components/engineer/JobCertsTab";
import JobServiceHistory from "@/components/engineer/JobServiceHistory";
import EngineerMediaGrid from "@/components/engineer/EngineerMediaGrid";
import EngineerJobMessages from "@/components/messages/EngineerJobMessages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";
import { buildManualCancelPatch } from "@/lib/cancelJobPatch";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:     { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:        { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
  "In Progress": { color: "text-warning",     bg: "bg-warning/10",     label: "In Progress" },
  Completed:     { color: "text-success",     bg: "bg-success/10",     label: "Completed" },
  Cancelled:     { color: "text-destructive", bg: "bg-destructive/10", label: "Cancelled" },
  parts_needed:  { color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Parts Needed" },
  parts_ordered: { color: "text-blue-600",    bg: "bg-blue-100",       label: "Parts Ordered" },
  // BJ-0078 — engineer-facing label; office keeps "Awaiting Booking".
  parts_arrived: { color: "text-[#7C3AED]",   bg: "bg-[#F3E8FF]",      label: "Parts Ready to Fit" },
};

const TIME_LABELS: Record<string, string> = {
  "9–11": "9–11am",
  "11–2": "11am–1pm",
  "2–5":  "2–5pm",
};

const getJobRef = (job: any) => job?.job_reference || `KN-${job?.id?.slice(0, 6).toUpperCase() || '???'}`;

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
  const [officeOwnerId, setOfficeOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [replyNote, setReplyNote] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [engineerInfo, setEngineerInfo] = useState<{ name: string; rgi_number: string | null }>({ name: "", rgi_number: null });
  const [activeTab, setActiveTab] = useState<"details" | "certs">("details");
  const [showPayment, setShowPayment] = useState(false);
  const [completeData, setCompleteData] = useState<any>(null);
  const [completeJobTagDate, setCompleteJobTagDate] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ customerName: string } | null>(null);
  const profileIdRef = useRef<string | null>(null);


  useEffect(() => {
    if (authLoading) return;
    if (!user || !id) { setLoading(false); return; }
    fetchJob();
  }, [user, id, authLoading]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("engineers")
      .select("name, rgi_number")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data, error: engErr }) => {
        if (engErr) { console.error("[EngineerJobDetail] engineers fetch failed", engErr); return; }
        if (data) setEngineerInfo({ name: data.name, rgi_number: (data as any).rgi_number || null });
      });
  }, [user]);

  // profiles.id cached while online so the job_payments row's recorded_by never
  // needs a network read at write time (offline safety), mirroring useEngineerJobs.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error: profErr }) => {
        if (profErr) { console.warn("[EngineerJobDetail] profile id lookup failed", profErr); return; }
        if (data?.id) profileIdRef.current = data.id;
      });
  }, [user]);


  const fetchJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: jobData, error: jobError } = await supabase
        .from("service_calls")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (jobError) { setError(jobError.message || "Couldn't load this job."); return; }

      if (!jobData) {
        toast({ title: "Job not found", variant: "destructive" });
        navigate("/engineer/today");
        return;
      }

      setJob(jobData);

      const [custRes, notesRes, certRes, tagsRes, orgRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", jobData.customer_id).maybeSingle(),
        supabase.from("customer_call_notes").select("*").eq("customer_id", jobData.customer_id).order("created_at", { ascending: false }),
        supabase.from("certificates").select("id, pdf_url, cert_number").eq("job_id", id).maybeSingle(),
        supabase.from("service_call_tags").select("tag_id, job_tags(name, colour)").eq("service_call_id", id!),
        (jobData as any).organisation_id
          ? supabase.from("organisations").select("owner_user_id").eq("id", (jobData as any).organisation_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const queryError = custRes.error || notesRes.error || certRes.error || tagsRes.error;
      if (queryError) { setError(queryError.message || "Couldn't load this job."); return; }

      if (custRes.data) setCustomer(custRes.data);
      if (notesRes.data) setCallNotes(notesRes.data);
      setCertificate(certRes.data || null);
      setOfficeOwnerId((orgRes as any)?.data?.owner_user_id ?? (jobData as any).user_id ?? null);
      setJobTags((tagsRes.data || []).map((r: any) => ({ name: r.job_tags?.name, colour: r.job_tags?.colour })).filter((t: any) => t.name));
    } catch (e: any) {
      setError(e?.message || "Something went wrong loading this job.");
    } finally {
      setLoading(false);
    }
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

  const handlePaymentDone = async (method: string, confirmedAmount: number) => {
    console.log("[handlePaymentDone] method:", method, "amount:", confirmedAmount, "jobId:", job?.id);
    if (!completeData || !job) { console.log("[handlePaymentDone] early return: no completeData or job"); return; }
    setShowPayment(false);

    // Always include confirmedRevenue so updateJob writes it to service_calls.revenue
    const patchWithRevenue = { ...completeData, paymentMethod: method, confirmedRevenue: confirmedAmount };

    if (method === "invoice") {
      setInvoiceLoading(true);
      try {
        await updateJob({ status: "Completed", ...patchWithRevenue }, { jobTagDate: completeJobTagDate });
        // Invoice creation + navigation is now handled inside updateJob
      } catch (err) {
        console.error("handlePaymentDone invoice flow error:", err);
        toast({ title: "Failed to complete job", variant: "destructive" });
      }
      setInvoiceLoading(false);
    } else {
      try {
        await updateJob({ status: "Completed", ...patchWithRevenue }, { jobTagDate: completeJobTagDate });
        // Navigation to receipt screen is handled by updateJob on completion
      } catch (err) {
        console.error("handlePaymentDone cash/card flow error:", err);
        toast({ title: "Failed to complete job", description: "Please try again.", variant: "destructive" });
      }
    }
    setCompleteData(null);
    setCompleteJobTagDate(null);
  };

  const updateJob = async (patch: Record<string, any>, options?: { jobTagDate?: string | null }): Promise<boolean> => {
    console.log("[updateJob:detail] called with patch.status:", patch.status, "paymentMethod:", patch.paymentMethod, "jobId:", job?.id);
    if (!job) { console.log("[updateJob:detail] early return: no job"); return false; }
    const { workDone, parts, nextService, followUp, followUpNote, officeNote, boilerMake, boilerModel, warrantyExpiry, customerNotes, cancelReason, cancelNote, paymentMethod, selectedTags, confirmedRevenue, selectedJobType, ...rest } = patch;
    const completionSelectedTags = Array.isArray(selectedTags) ? selectedTags : [];

    // Boiler details persist on the customer record — only send keys the engineer actually changed
    // (clearing a pre-filled value is a real edit and is written as null).
    const customerBoilerUpdate: Record<string, any> = {};
    if (boilerMake !== undefined && (boilerMake || "") !== (customer?.boiler_brand || "")) {
      customerBoilerUpdate.boiler_brand = (boilerMake || "").trim() || null;
    }
    if (boilerModel !== undefined && (boilerModel || "") !== (customer?.boiler_model || "")) {
      customerBoilerUpdate.boiler_model = (boilerModel || "").trim() || null;
    }
    if (warrantyExpiry !== undefined && (warrantyExpiry || "") !== (customer?.warranty_expiry_date || "")) {
      customerBoilerUpdate.warranty_expiry_date = (warrantyExpiry || "").trim() || null;
    }

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

    const jobTagDate = options?.jobTagDate ?? null;
    const dbPatch: Record<string, any> = sanitizeServiceCallUpdatePayload({ ...rest });
    if (notesUpdate !== undefined) dbPatch.notes = notesUpdate;
    // Customer-facing receipt note — per visit, this job only
    if (customerNotes !== undefined) {
      dbPatch.customer_facing_notes = (customerNotes || "").trim() || null;
    }
    // Payment columns + ledger row come from the shared decision layer, so this
    // screen, the standalone PaymentSheet and TakePaymentModal all agree on
    // cumulative math and completion gating.
    const paidAt = new Date().toISOString();
    let ledgerRow: EngineerLedgerRow | null = null;
    if (paymentMethod) {
      dbPatch.payment_collected_by = user?.id || null;
      const plan = buildEngineerPaymentPlan({
        patch,
        paymentMethod,
        confirmedRevenue,
        job,
        jobId: job.id,
        paidAt,
        recordedBy: profileIdRef.current,
        entry: "completion",
      });
      Object.assign(dbPatch, plan.dbPatchAdditions);
      ledgerRow = plan.ledgerRow;
    }


    if (cancelReason) {
      Object.assign(dbPatch, buildManualCancelPatch(cancelReason, cancelNote, user?.id));
    }

    // Set completed_at and generate receipt number on completion
    if (patch.status === "Completed") {
      dbPatch.completed_at = paidAt;
      // A cached PDF from an earlier payment on this job would be re-sent as-is
      // by send-whatsapp-receipt; drop it so the receipt regenerates from the
      // settled figures.
      dbPatch.receipt_pdf_url = null;

      if (paymentMethod === "invoice") {
        dbPatch.invoiced_at = new Date().toISOString();
        const orgId = (job as any).organisation_id;
        // balance_due / payment_status / revenue already set by buildPaymentPatch above.
        try {
          const { nextInvoiceNumber } = await import("@/lib/nextInvoiceNumber");
          const invNum = await nextInvoiceNumber(orgId);
          if (invNum) dbPatch.invoice_number = invNum;
        } catch (e) {
          console.error("[EngineerJobDetail] invoice number generation failed", e);
        }
      }
      if (!job.receipt_number) {
        try {
          const { data: settingsRow } = await supabase
            .from("settings")
            .select("cert_prefix")
            .eq("organisation_id", (job as any).organisation_id)
            .maybeSingle();
          const prefix = ((settingsRow as any)?.cert_prefix || "").trim() || "R";
          const yr = new Date().getFullYear();
          const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
          dbPatch.receipt_number = `${prefix}-${yr}-${rand}`;
        } catch {}
      }
      // revenue (the booked job price) is intentionally NOT written here — a
      // payment never rewrites the price. See _shared/paymentUpdate.ts.

    }

    // Save selected tags to job_tags column — always set on completion
    if (patch.status === "Completed") {
      dbPatch.job_tags = completionSelectedTags;
      // Map completion job type to DB job_type
      if (selectedJobType) {
        const jobTypeMap: Record<string, string> = { Service: "Boiler Service", Repair: "Repair", Install: "Install" };
        dbPatch.job_type = jobTypeMap[selectedJobType] || selectedJobType;
      }
    }

    const safeDbPatch = sanitizeServiceCallUpdatePayload(dbPatch);
    console.log("[updateJob:detail] safeDbPatch keys:", Object.keys(safeDbPatch), "status:", safeDbPatch.status, "payment_method:", safeDbPatch.payment_method);
    const { error } = await supabase.from("service_calls").update(safeDbPatch).eq("id", job.id);
    if (error) {
      console.error("[updateJob:detail] DB update FAILED, queuing for retry:", error.message, error);
      const jobItemId = addToQueue({
        table: "service_calls",
        operation: "update",
        payload: safeDbPatch,
        filter: { column: "id", value: job.id },
      });
      // The ledger row must never land without the job write that justifies it.
      if (ledgerRow) {
        addToQueue({
          table: "job_payments",
          operation: "insert",
          payload: ledgerRow as any,
          dependsOnId: jobItemId,
        });
      }
      if (Object.keys(customerBoilerUpdate).length > 0 && job.customer_id) {
        addToQueue({
          table: "customers",
          operation: "update",
          payload: customerBoilerUpdate,
          filter: { column: "id", value: job.customer_id },
        });
      }
      toast({
        title: "No connection",
        description: "Update saved and will sync automatically when back online",
        variant: "destructive",
      });
      return false;
    } else {
      console.log("[updateJob:detail] DB update SUCCESS for job:", job.id);
      // Append-only payment ledger. Never blocks the job: the job write is the
      // source of truth and has already committed.
      if (ledgerRow) {
        const { error: ledgerErr } = await supabase.from("job_payments").insert(ledgerRow as any);
        if (ledgerErr) {
          console.error("[updateJob:detail] job_payments insert failed", ledgerErr);
          addToQueue({ table: "job_payments", operation: "insert", payload: ledgerRow as any });
          toast({
            title: "Payment recorded",
            description: "The payment record will finish syncing shortly.",
          });
        }
      }

      if (cancelReason) {
        supabase.functions.invoke('cancel-job-notify', {
          body: {
            service_call_id: job.id,
            cancellation_reason: cancelReason,
          },
        }).catch((err) => console.error('cancel-job-notify failed:', err));
        supabase.functions.invoke('send-cancellation-notice', {
          body: { service_call_id: job.id },
        }).catch((err) => console.error('send-cancellation-notice failed:', err));
      }
      // Persist boiler make / model / warranty expiry from the completion sheet to the customer
      if (Object.keys(customerBoilerUpdate).length > 0 && job.customer_id) {
        try {
          const { error: custErr } = await supabase.from("customers").update(customerBoilerUpdate).eq("id", job.customer_id);
          if (custErr) throw custErr;
          console.log("[updateJob:detail] Customer boiler details saved:", Object.keys(customerBoilerUpdate));
        } catch (custSyncErr) {
          console.error("[updateJob:detail] Customer boiler details save failed:", custSyncErr);
        }
      }
      // Sync boiler details back to customer record

      if (safeDbPatch.boiler_brand !== undefined) {
        try {
          const customerUpdate: Record<string, any> = {};
          if (safeDbPatch.boiler_brand !== undefined) customerUpdate.boiler_brand = safeDbPatch.boiler_brand;
          if (Object.keys(customerUpdate).length > 0) {
            const brand = (customerUpdate.boiler_brand || "").trim();
            const existingModel = customer?.boiler_model || customer?.boiler_make_model || "";
            customerUpdate.boiler_make_model = [brand, existingModel].filter(Boolean).join(" ") || null;
            await supabase.from("customers").update(customerUpdate).eq("id", job.customer_id);
            console.log("[updateJob:detail] Boiler details synced to customer:", job.customer_id);
          }
        } catch (syncErr) {
          console.error("[updateJob:detail] Boiler sync to customer failed:", syncErr);
        }
      }
      // Log payment_received activity when payment is recorded as paid
      if (safeDbPatch.payment_status === "paid" && paymentMethod && paymentMethod !== "invoice") {
        try {
          const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
          const methodLabel = paymentMethod === "cash" ? "Cash" : paymentMethod === "card" ? "Card" : paymentMethod;
          const amountVal = confirmedRevenue ?? safeDbPatch.revenue ?? job.revenue ?? 0;
          const amountStr = Number(amountVal).toLocaleString("en-IE", { maximumFractionDigits: 0 });
          await supabase.from("customer_activity").insert({
            organisation_id: job.organisation_id,
            customer_id: job.customer_id,
            service_call_id: job.id,
            event_type: "payment_received",
            event_label: `Payment received — €${amountStr} — ${methodLabel}`,
            created_by: profile?.id || null,
          } as any);
        } catch (e) {
          console.error("Failed to log payment activity:", e);
        }
        // Fire-and-forget: send WhatsApp payment-received confirmation
        supabase.functions.invoke("send-payment-received", { body: { service_call_id: job.id, payment_amount: confirmedRevenue } }).catch(() => {});
      }


      // Save selected tags on completion

      if (patch.status === "Completed") {
        try {
          const { data: existing } = await supabase
            .from("service_call_tags")
            .select("id, tag_id")
            .eq("service_call_id", job.id);

          const existingRows = existing || [];
          const existingIds = new Set(existingRows.map((row: any) => row.tag_id));

          const tagRows = completionSelectedTags.length > 0
            ? (await supabase
                .from("job_tags")
                .select("id, name")
                .in("name", completionSelectedTags)).data || []
            : [];

          const selectedIds = new Set(tagRows.map((row: any) => row.id));
          const linkIdsToDelete = existingRows
            .filter((row: any) => !selectedIds.has(row.tag_id))
            .map((row: any) => row.id);

          if (linkIdsToDelete.length > 0) {
            await supabase.from("service_call_tags").delete().in("id", linkIdsToDelete);
          }

          if (tagRows.length > 0) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("user_id", user!.id)
              .maybeSingle();

            const profileId = profile?.id || null;

            const inserts = tagRows
              .filter((row: any) => !existingIds.has(row.id))
              .map((row: any) => ({
                service_call_id: job.id,
                tag_id: row.id,
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

      // Sync completion data to customer record
      if (patch.status === "Completed") {
        try {
          const completedDate = new Date();
          const dd = String(completedDate.getDate()).padStart(2, "0");
          const mm = String(completedDate.getMonth() + 1).padStart(2, "0");
          const yyyy = completedDate.getFullYear();
          const dateStr = `${dd}/${mm}/${yyyy}`;

          // Calculate next_service_due from nextService dropdown
          let nextServiceDate: string | null = null;
          if (nextService) {
            const nsd = new Date(completedDate);
            if (nextService === "6 months") nsd.setMonth(nsd.getMonth() + 6);
            else if (nextService === "12 months") nsd.setMonth(nsd.getMonth() + 12);
            else if (nextService === "18 months") nsd.setMonth(nsd.getMonth() + 18);
            else if (nextService === "2 years") nsd.setFullYear(nsd.getFullYear() + 2);
            nextServiceDate = nsd.toISOString().slice(0, 10);
          }

          const customerUpdate: Record<string, any> = {
            last_service_date: completedDate.toISOString().slice(0, 10),
            last_service_engineer: job.assigned_engineer || null,
            service_status: "Serviced",
            renewal_stage: "not_contacted",
          };

          if (nextServiceDate) {
            customerUpdate.next_service_due = nextServiceDate;
          }

          // Reflect job tags on customer
          customerUpdate.under_warranty = completionSelectedTags.includes("Under Warranty");
          const TAG_WITH_DATE = ["New Boiler Fitted", "New Boiler Soon", "Under Warranty"];
          const matchedTag = completionSelectedTags.find((t: string) => TAG_WITH_DATE.includes(t));
          if (matchedTag && jobTagDate) {
            customerUpdate.job_tag = matchedTag;
            customerUpdate.job_tag_date = jobTagDate;
          }

          // Append engineer notes with parts + office note + tags
          const engNoteParts: string[] = [];
          if (parts && parts.trim()) engNoteParts.push(`Parts: ${parts.trim()}`);
          if (officeNote && officeNote.trim()) engNoteParts.push(`Office note: ${officeNote.trim()}`);
          if (completionSelectedTags.length > 0) {
            let tagStr = `Tags: ${completionSelectedTags.join(", ")}`;
            if (jobTagDate) {
              const [y, m, d] = jobTagDate.split("-");
              tagStr += ` (${d}/${m}/${y})`;
            }
            engNoteParts.push(tagStr);
          }
          if (engNoteParts.length > 0) {
            const { data: custData } = await supabase
              .from("customers")
              .select("engineer_notes")
              .eq("id", job.customer_id)
              .maybeSingle();

            const engNoteEntry = `${dateStr} — ${engNoteParts.join(". ")}.`;
            const existingEng = custData?.engineer_notes;
            customerUpdate.engineer_notes = existingEng && existingEng.trim()
              ? `${existingEng}\n${engNoteEntry}`
              : engNoteEntry;
          }

          const { error: custErr } = await supabase
            .from("customers")
            .update(customerUpdate)
            .eq("id", job.customer_id);

          if (custErr) {
            console.error("Failed to sync customer profile:", custErr.message);
          }
        } catch (e) {
          console.error("Error syncing customer profile:", e);
        }
      }

      if (patch.status === "Completed") {
        logAudit({ action_type: "job_completed", entity_type: "service_call", entity_id: job.id, detail: "Completed by engineer" });
        // Fire-and-forget: trigger review request via Make.com
        supabase.functions.invoke("trigger-review-request", {
          body: { service_call_id: job.id, customer_id: job.customer_id },
        }).catch((err) => console.error("Review request trigger failed:", err));

        // Create invoice + send WhatsApp BEFORE navigating away
        console.log("[updateJob:detail] Reached invoice block. paymentMethod:", paymentMethod);
        if (paymentMethod === "invoice") {
          let invoiceCreated = false;
          try {
            const result = await createJobInvoice(job.id);
            const invoiceNumber = result?.invoice_number || null;
            if (invoiceNumber) {
              await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload({ invoice_number: invoiceNumber })).eq("id", job.id);
            }
            invoiceCreated = true;
          } catch (err) {
            console.error("[create-job-invoice] error:", err);
            toast({ title: "Job completed but invoice creation failed", description: "Please create the invoice manually from the office.", variant: "destructive" });
          }
          if (invoiceCreated) {
            toast({ title: "Job completed & invoice created" });
          }
          navigate(`/invoice-view/${job.id}`);
        } else {
          toast({ title: "Job completed" });
          navigate(-1);
        }
        return true;
      } else if (patch.status === "Cancelled") {
        logAudit({ action_type: "job_cancelled", entity_type: "service_call", entity_id: job.id, detail: `Cancelled by engineer: ${patch.cancelReason}`, metadata: { reason: patch.cancelReason, note: patch.cancelNote } });
      } else if (patch.status === "In Progress") {
        logAudit({ action_type: "job_started", entity_type: "service_call", entity_id: job.id, detail: "Job started by engineer" });
      }
      toast({ title: patch.status === "Cancelled" ? "Job cancelled" : "Updated" });
      fetchJob();
      return true;
    }
  };

  const handleReschedule = async () => {
    if (!job || !rescheduleDate) return;
    setActionLoading(true);
    const patch: Record<string, any> = { scheduled_date: rescheduleDate, time_block: rescheduleTime || null };
    if (job.status === "parts_needed" || job.status === "parts_ordered" || job.status === "parts_arrived") {
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
      logAudit({ action_type: "job_rescheduled", entity_type: "service_call", entity_id: job.id, detail: `Rescheduled by engineer to ${rescheduleDate} ${rescheduleTime || ""}`.trim() });
      toast({ title: "Job rescheduled" });
      setShowReschedule(false);
      fetchJob();
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-[430px] mx-auto min-h-screen bg-secondary pb-32">
      <div className="bg-gradient-to-br from-primary to-primary-dark px-4 pt-12 pb-5 relative overflow-hidden">
        <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-white/[0.07] pointer-events-none" />
        <button onClick={() => navigate("/engineer/today")} className="flex items-center gap-1.5 text-white/80 text-sm font-semibold mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-xl font-extrabold text-white">Job</div>
      </div>
      <div className="px-4 pt-4">{children}</div>
    </div>
  );


  if (authLoading || loading) {
    return (
      <div className="max-w-[430px] mx-auto min-h-screen bg-secondary flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="text-center py-12 bg-card rounded-2xl border border-border px-4 space-y-3">
          <Key className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <div className="text-sm font-bold text-foreground">Your session has expired</div>
          <p className="text-xs text-muted-foreground">Please log in again to view this job.</p>
          <Button className="w-full h-11 font-bold" onClick={() => navigate("/auth")}>Log in again</Button>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="text-center py-12 bg-card rounded-2xl border border-border px-4 space-y-3">
          <AlertTriangle className="w-10 h-10 text-destructive/60 mx-auto" />
          <div className="text-sm font-bold text-foreground">Couldn't load this job</div>
          <p className="text-xs text-muted-foreground break-words">{error}</p>
          <Button variant="outline" className="w-full h-11 font-bold" onClick={() => fetchJob()}>Try again</Button>
        </div>
      </Shell>
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
            <div className="text-[11px] font-bold text-white/60 tracking-wider">{getJobRef(job)}</div>
            <div className="text-2xl font-extrabold text-white leading-tight">{customer.name}</div>
            <div className="text-[13px] text-white/70 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {customer.address}
            </div>
            {(job.customer_status_at_booking === "new" || job.source === "Renewal") && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {job.customer_status_at_booking === "new" && (
                  <span className="bg-emerald-500/20 border border-emerald-300/30 rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-50 flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> New Customer
                  </span>
                )}
                {job.source === "Renewal" && (
                  <span
                    className="bg-amber-400/20 border border-amber-200/30 rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-50 flex items-center gap-1"
                    title="Rebooking (Renewal)"
                    aria-label="Rebooking (Renewal)"
                  >
                    <RotateCw className="w-3 h-3" /> Rebooking
                  </span>
                )}
              </div>
            )}

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

      <div className="px-4 pt-3 space-y-4">
        {/* Tab bar */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "flex-1 px-3 py-2.5 text-xs font-bold transition-colors",
              activeTab === "details" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("certs")}
            className={cn(
              "flex-1 px-3 py-2.5 text-xs font-bold transition-colors",
              activeTab === "certs" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            )}
          >
            Certs
          </button>
        </div>

        {activeTab === "certs" ? (
          <JobCertsTab job={job} customer={customer} engineerInfo={engineerInfo} />
        ) : (
        <>
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

          {/* Contact */}
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3" />Mobile
            </div>
            <a href={`tel:${customer.phone}`} className="text-[13px] font-bold text-primary underline leading-snug">
              {customer.phone || "—"}
            </a>
          </div>
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <Mail className="w-3 h-3" />Email
            </div>
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="text-[13px] font-bold text-primary underline leading-snug break-all">
                {customer.email}
              </a>
            ) : (
              <div className="text-[13px] font-bold text-foreground leading-snug">—</div>
            )}
          </div>

          {/* Address */}
          <InfoTile label="Full Address" value={customer.address} Icon={MapPin} full />
          <InfoTile label="Area Code" value={customer.area_code} Icon={MapPinned} />
          <InfoTile label="Eircode" value={customer.eircode} Icon={MapPin} />
          <InfoTile label="GPRN" value={customer.gprn} Icon={MapPinned} />

          {/* Boiler */}
          <InfoTile label="Boiler Brand" value={job.boiler_brand} Icon={Flame} />
          <InfoTile label="Boiler Model" value={customer.boiler_make_model} Icon={Flame} />
          {customer.boiler_location?.trim() && <InfoTile label="Boiler Location" value={customer.boiler_location} Icon={MapPin} />}
          {job.boiler_type && <InfoTile label="Boiler Type" value={job.boiler_type} Icon={Flame} />}
          {job.boiler_error_code && <InfoTile label="Error Code" value={job.boiler_error_code} Icon={AlertTriangle} />}
          {job.boiler_working !== null && job.boiler_working !== undefined && (
            <InfoTile label="Boiler Working" value={job.boiler_working ? "Yes" : "No"} Icon={job.boiler_working ? CheckCircle2 : XCircle} />
          )}

          {/* Other */}
          {/* Same shared classifier as the job card pill, so the two always agree. */}
          {(() => {
            const { pill, balanceLine } = resolveDepositPill(job);
            if (!pill) return null;
            return (
              <InfoTile
                label="Payment"
                value={balanceLine ? `${pill.label} · ${balanceLine}` : pill.label}
                Icon={pill.tone === "success" ? CreditCard : Hourglass}
                full
              />
            );
          })()}
          <InfoTile label="Last Service" value={customer.last_service_date ? new Date(customer.last_service_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null} Icon={Calendar} />
          <InfoTile label="Last Engineer" value={customer.last_service_engineer} Icon={Wrench} />
          {job.owner_or_tenant && <InfoTile label="Owner / Tenant" value={job.owner_or_tenant} Icon={Key} />}
        </div>

        {/* Job Issue / Problem Description */}
        {job.job_issue && (
          <div className="bg-destructive/10 border-l-[3px] border-destructive rounded-r-xl p-3">
            <div className="text-[11px] font-bold text-destructive uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Problem Description
            </div>
            <div className="text-[13px] text-foreground leading-snug">{job.job_issue}</div>
          </div>
        )}

        {/* Extra Details */}
        {job.extra_details && (
          <div className="bg-secondary rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Extra Details
            </div>
            <div className="text-[13px] text-foreground whitespace-pre-wrap">{job.extra_details}</div>
          </div>
        )}

        {/* Job-level Access Notes */}
        {job.access_notes && (
          <div className="bg-primary/5 rounded-xl border border-primary/10 p-3">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <Key className="w-3 h-3" /> Access Notes (Job)
            </div>
            <div className="text-[13px] text-foreground">{job.access_notes}</div>
          </div>
        )}

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

        {/* Parts Ready to Fit banner (BJ-0078) */}
        {job.status === "parts_arrived" && (
          <div className="rounded-r-xl p-3 flex items-center gap-2.5" style={{ backgroundColor: "#FAF5FF", borderLeft: "3px solid #7C3AED" }}>
            <PackageCheck className="w-4 h-4 shrink-0" style={{ color: "#7C3AED" }} />
            <div>
              <div className="text-[13px] font-bold" style={{ color: "#7C3AED" }}>Parts Ready to Fit</div>
              <div className="text-[11px] text-muted-foreground">Parts are in — book the return visit</div>
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

        {/* Customer receipt note (read-only) — same field the Today card shows */}
        {job.customer_facing_notes?.trim() && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Receipt className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Notes for customer receipt</span>
            </div>
            <div className="text-[13px] text-foreground leading-snug whitespace-pre-wrap">{job.customer_facing_notes.trim()}</div>
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

        {/* Service history, media and messages — same components as the Today card */}
        <div>
          <JobServiceHistory jobId={job.id} customerId={job.customer_id} />
          <EngineerMediaGrid jobId={job.id} />
          <EngineerJobMessages jobId={job.id} officeUserId={officeOwnerId || job.user_id} />
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
                {new Date(job.cancelled_at).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
            <Button variant="outline" className="flex flex-col items-center gap-1 h-auto py-3 text-xs font-bold" style={{ color: "#e8760a", backgroundColor: "#fff8f0", borderColor: "#f5c07a" }} onClick={() => setShowExtraWork(true)}>
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
            
            <Button
              className="w-full h-14 text-lg font-extrabold gap-2 text-white"
              style={{ backgroundColor: "#1e3a5f" }}
              onClick={() => navigate(`/engineer/job/${id}/certificates`)}
            >
              <FileText className="w-5 h-5" /> Certificates
            </Button>
          </div>
        )}
        </>
        )}
      </div>

      {/* Sheets */}
      {showComplete && (
        <CompleteSheet
          job={job}
          customer={customer}
          onClose={() => setShowComplete(false)}
          onDone={(data: any, jobTagDate: string | null) => { setCompleteData(data); setCompleteJobTagDate(jobTagDate); setShowComplete(false); setShowPayment(true); }}
        />
      )}
      {showPayment && (
        <PaymentSheet
          job={job}
          customer={customer}
          onClose={() => { setShowPayment(false); setCompleteData(null); setCompleteJobTagDate(null); }}
          onCompleteOnly={async () => {
            if (!completeData) return;
            setShowPayment(false);
            // Already fully paid — completion fields only, no payment write.
            try {
              await updateJob({ status: "Completed", ...completeData }, { jobTagDate: completeJobTagDate });
            } catch (err) {
              console.error("onCompleteOnly flow error:", err);
              toast({ title: "Failed to complete job", description: "Please try again.", variant: "destructive" });
            }
            setCompleteData(null);
            setCompleteJobTagDate(null);
          }}
          onDone={handlePaymentDone}
        />
      )}

      {/* Invoice loading overlay */}
      {invoiceLoading && (
        <div className="fixed inset-0 z-[700] bg-background/80 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-sm font-bold text-foreground">Creating invoice & sending to customer…</div>
        </div>
      )}

      {/* Invoice success dialog */}
      <Dialog open={!!invoiceSuccess} onOpenChange={() => { setInvoiceSuccess(null); navigate("/engineer/today"); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" /> Job Complete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Invoice sent to <span className="font-bold">{invoiceSuccess?.customerName}</span>
          </p>
          <Button className="w-full mt-2" onClick={() => { setInvoiceSuccess(null); navigate("/engineer/today"); }}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
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
