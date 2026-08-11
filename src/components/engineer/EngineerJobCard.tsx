import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import EngineerMediaGrid from "./EngineerMediaGrid";
import { MapPin, AlertTriangle, Play, CheckCircle2, CreditCard, Receipt, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CompleteSheet from "./CompleteSheet";
import CancelSheet from "./CancelSheet";
import NoteSheet from "./NoteSheet";
import MediaSheet from "./MediaSheet";
import JobDetailSheet from "./JobDetailSheet";
import ExtraWorkSheet from "./ExtraWorkSheet";
import JobPhotoThumbnails from "./JobPhotoThumbnails";
import NoShowSheet from "./NoShowSheet";
import PartsNeededSheet from "./PartsNeededSheet";
import PaymentSheet from "./PaymentSheet";

import JobServiceHistory from "./JobServiceHistory";
import JobNotesSection from "./JobNotesSection";
import TakePaymentModal from "@/components/payments/TakePaymentModal";
import EngineerJobMessages from "@/components/messages/EngineerJobMessages";
import StatusBadge from "./job-card/StatusBadge";
import InfoPills from "./job-card/InfoPills";
import QuickActions from "./job-card/QuickActions";
import SecondaryActions from "./job-card/SecondaryActions";
import PrimaryActions from "./job-card/PrimaryActions";
import MessageOfficeModal from "./MessageOfficeModal";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { useLastCompletedService } from "@/hooks/useLastCompletedService";
import { insertPartsRequests, priorityRank } from "@/lib/partsRequests";

const getJobRef = (job: any) => job?.job_reference || `KN-${job?.id?.slice(0, 6).toUpperCase() || '???'}`;

interface EngineerJobCardProps {
  job: any;
  customer: any;
  onUpdate: (jobId: string, patch: Record<string, any>, options?: { jobTagDate?: string | null }) => void;
  isNextJob?: boolean;
  photos?: { url: string; name: string }[];
}

const EngineerJobCard = ({ job, customer, onUpdate, isNextJob = false, photos = [] }: EngineerJobCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showDetail, setShowDetail] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);
  const [showPartsNeeded, setShowPartsNeeded] = useState(false);
  const [savingParts, setSavingParts] = useState(false);
  const [showTakePayment, setShowTakePayment] = useState(false);
  const [showMessageOffice, setShowMessageOffice] = useState(false);
  const [showCompletionPayment, setShowCompletionPayment] = useState(false);
  const [pendingCompletionData, setPendingCompletionData] = useState<{ data: any; jobTagDate: string | null } | null>(null);

  const { data: lastService } = useLastCompletedService(job.customer_id, job.id);

  const { data: officeOwnerId } = useQuery({
    queryKey: ["org-owner", job.organisation_id],
    enabled: !!job.organisation_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("organisations")
        .select("owner_user_id")
        .eq("id", job.organisation_id)
        .maybeSingle();
      return (data as any)?.owner_user_id ?? null;
    },
  });
  const { data: jobTags = [] } = useQuery({
    queryKey: ["job-card-tags", job.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_call_tags")
        .select("tag_id, job_tags(name, colour)")
        .eq("service_call_id", job.id);
      return (data || []).map((r: any) => ({ name: r.job_tags?.name, colour: r.job_tags?.colour })).filter((t: any) => t.name);
    },
  });
  const isDone = job.status === "Completed" || job.status === "Cancelled" || job.status === "no_show";
  const isActive = ["En Route", "On Site", "In Progress"].includes(job.status);
  const isPartsStatus = job.status === "parts_needed" || job.status === "parts_ordered";

  const borderLeftColor = job.status === "parts_ordered" ? "#2563EB" : job.status === "parts_needed" ? "#F59E0B" : `hsl(var(--${
    job.job_type === "Emergency" ? "destructive" :
    isActive ? "warning" :
    job.status === "Completed" ? "success" :
    job.status === "Cancelled" ? "destructive" : "primary"
  }))`;

  return (
    <>
      <div
        className={`bg-card rounded-2xl border border-l-4 p-5 mb-4 transition-all ${isDone ? "opacity-70 cursor-pointer" : ""} ${isNextJob ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20 shadow-md" : "border-border/60"}`}
        style={{ borderLeftColor }}
        onClick={isDone ? () => navigate(`/engineer/job/${job.id}`) : undefined}
      >
        {/* Next Job Badge */}
        {isNextJob && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
              <Play className="w-3 h-3" /> Next Job
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <div className="text-2xl font-bold text-gray-900 leading-tight mb-0.5">Job Ref: {getJobRef(job)}</div>
            <div className="text-xl font-bold text-gray-900 leading-tight">{customer.name}</div>
          </div>
        <StatusBadge status={job.status} />
        </div>

        {/* Parts Needed / Ordered note preview */}
        {job.status === "parts_needed" && job.notes?.startsWith("Parts Needed") && (
          <p className="text-xs text-muted-foreground/70 mb-1 truncate">
            {job.notes.replace(/^Parts Needed(?:\s*\[\w+\])?:\s*/, "")}
          </p>
        )}
        {job.status === "parts_ordered" && (
          <p className="text-xs mb-1 truncate" style={{ color: "#2563EB" }}>
            Parts Ordered — office is sourcing your parts
          </p>
        )}

        {/* Address */}
        <div className="text-base font-bold text-gray-900 mb-3 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" /> {[customer.address, job.area_code || customer.area_code, customer.eircode].filter(Boolean).join(", ")}
        </div>

        {/* Always-visible phone for completed cards */}
        {isDone && customer.phone && (
          <a href={`tel:${customer.phone}`} className="text-[13px] text-primary font-semibold mb-3 flex items-center gap-1.5 active:opacity-70">
            <Phone className="w-3.5 h-3.5 shrink-0" /> {customer.phone}
          </a>
        )}

        <InfoPills timeBlock={job.time_block} jobType={job.job_type} boilerBrand={job.boiler_brand} depositPaid={job.deposit_paid} scheduledDate={job.scheduled_date} />

        {/* Saved Tags */}
        {jobTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {jobTags.map((tag: any) => (
              <span
                key={tag.name}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: tag.colour }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Last Service Info */}
        <div className="flex gap-4 mb-3 text-xs">
          <div>
            <span className="text-muted-foreground/60 font-semibold">Last Service: </span>
            <span className="font-bold text-foreground">{lastService?.date || "No previous service"}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60 font-semibold">Engineer: </span>
            <span className="font-bold text-foreground">{lastService?.engineerName || "—"}</span>
          </div>
        </div>

        {/* Issue */}
        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-lg p-3 mb-4 text-[13px] text-foreground leading-snug flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" /> {job.boiler_issue}
          </div>
        )}

        <QuickActions jobId={job.id} customerPhone={customer.phone} customerAddress={customer.address} customerEircode={customer.eircode} />

        {/* Collapsible Service History & Notes */}
        <JobServiceHistory jobId={job.id} customerId={job.customer_id} />
        <JobNotesSection jobId={job.id} customerId={job.customer_id} jobNotes={job.notes} />
        <EngineerMediaGrid jobId={job.id} />
        <EngineerJobMessages jobId={job.id} officeUserId={officeOwnerId || job.user_id} />

        {!isDone && (
          <SecondaryActions
            isActive={isActive}
            job={job}
            customer={customer}
            onNote={() => setShowNote(true)}
            onPhotos={() => setShowPhotos(true)}
            onExtraWork={() => setShowExtraWork(true)}
          />
        )}

        {!isDone && (
          <PrimaryActions
            status={job.status}
            onStatusChange={(newStatus) => onUpdate(job.id, { status: newStatus })}
            onComplete={() => setShowComplete(true)}
            onCancel={() => setShowCancel(true)}
            onNoShow={() => setShowNoShow(true)}
            onPartsNeeded={() => setShowPartsNeeded(true)}
          />
        )}

        {/* Message Office button */}
        {!isDone && (
          <Button
            variant="outline"
            className="w-full h-[52px] text-base font-extrabold gap-2 mt-2 bg-white border-[#4A86E8] text-[#4A86E8] hover:bg-[#4A86E8]/5"
            onClick={() => setShowMessageOffice(true)}
          >
            <Mail className="w-5 h-5" /> 📩 Message Office
          </Button>
        )}

        {job.status === "Completed" && (
          <>
            <JobPhotoThumbnails photos={photos} />
            <div className="bg-success/10 rounded-xl p-3.5 flex items-center gap-2.5 mt-1">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <div className="text-[13px] font-bold text-success">Completed</div>
            </div>
          </>
        )}

        {/* Take Payment button for Completed / In Progress */}
        {["Completed", "In Progress"].includes(job.status) && (
          <div className="mt-3">
            {job.receipt_number ? (
              <button
                onClick={() => window.location.href = `/receipt-view/${job.id}`}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-bold text-sm"
              >
                <Receipt className="w-4 h-4" /> {job.receipt_number}
              </button>
            ) : (
              <Button
                className="w-full h-12 text-sm font-extrabold gap-2"
                onClick={async () => {
                  // Fresh check against DB to prevent duplicates across views
                  const { data } = await supabase
                    .from("service_calls")
                    .select("receipt_number")
                    .eq("id", job.id)
                    .maybeSingle();
                  if (data?.receipt_number) {
                    toast({ title: "Payment already taken", description: `Receipt ${data.receipt_number}` });
                    onUpdate(job.id, {}); // refresh local state
                    return;
                  }
                  setShowTakePayment(true);
                }}
              >
                <CreditCard className="w-4 h-4" /> Take Payment{job.revenue ? ` — €${Number(job.revenue).toFixed(2)}` : ""}
              </Button>
            )}
          </div>
        )}

      </div>

      {showDetail && <JobDetailSheet job={job} customer={customer} onClose={() => setShowDetail(false)} onStart={(id: string) => onUpdate(id, { status: "In Progress" })} />}
      {showComplete && <CompleteSheet job={job} customer={customer} onClose={() => setShowComplete(false)} onDone={(data: any, jobTagDate: string | null) => { setPendingCompletionData({ data, jobTagDate }); setShowComplete(false); setShowCompletionPayment(true); }} />}
      {showCancel && <CancelSheet job={job} customer={customer} onClose={() => setShowCancel(false)} onDone={(reason: string, note: string) => { onUpdate(job.id, { status: "Cancelled", cancelReason: reason, cancelNote: note }); setShowCancel(false); }} />}
      {showNote && <NoteSheet job={job} customer={customer} onClose={() => setShowNote(false)} onSave={(note: string) => { onUpdate(job.id, { notes: note }); setShowNote(false); }} />}
      {showPhotos && <MediaSheet job={job} customer={customer} onClose={() => setShowPhotos(false)} onSave={() => setShowPhotos(false)} />}
      {showExtraWork && <ExtraWorkSheet job={job} customer={customer} onClose={() => setShowExtraWork(false)} />}
      <NoShowSheet open={showNoShow} onClose={() => setShowNoShow(false)} onConfirm={(reason, notes) => { onUpdate(job.id, { status: "no_show", notes: `No Show: ${reason}${notes ? ` — ${notes}` : ""}` }); setShowNoShow(false); }} />
      <PartsNeededSheet
        open={showPartsNeeded}
        loading={savingParts}
        onClose={() => setShowPartsNeeded(false)}
        onConfirm={async (lines) => {
          setSavingParts(true);
          const { data: auth } = await supabase.auth.getUser();
          const { error, count } = await insertPartsRequests({
            lines,
            organisationId: job.organisation_id,
            serviceCallId: job.id,
            customerId: job.customer_id,
            loggedBy: auth?.user?.id ?? null,
            loggedByName: job.assigned_engineer || "Engineer",
            assignedTo: job.assigned_engineer_id ?? null,
          });
          setSavingParts(false);
          if (error) {
            toast({ title: "Couldn't save parts", description: error.message, variant: "destructive" });
            return;
          }
          setShowPartsNeeded(false);
          // Keep the job's denormalised summary (used by Jobs/Schedule badges) in step.
          const topPriority = [...lines].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0]?.priority;
          onUpdate(job.id, { parts_priority: topPriority, parts_logged_at: new Date().toISOString() });
          toast({ title: count > 1 ? `${count} parts noted — office has been informed` : "Parts noted — office has been informed" });
        }}
      />
      {showTakePayment && (
        <TakePaymentModal
          open={showTakePayment}
          onClose={() => setShowTakePayment(false)}
          job={job}
          customer={customer}
          onPaymentComplete={() => {
            onUpdate(job.id, {}); // trigger refresh
          }}
        />
      )}
      {showCompletionPayment && pendingCompletionData && (
        <PaymentSheet
          job={job}
          customer={customer}
          onClose={() => { setShowCompletionPayment(false); setPendingCompletionData(null); }}
          onDone={(method: string, confirmedAmount: number) => {
            setShowCompletionPayment(false);
            onUpdate(job.id, {
              status: "Completed",
              ...pendingCompletionData.data,
              paymentMethod: method,
              revenue: confirmedAmount,
            }, { jobTagDate: pendingCompletionData.jobTagDate });
            setPendingCompletionData(null);
          }}
        />
      )}
      <MessageOfficeModal
        open={showMessageOffice}
        onOpenChange={setShowMessageOffice}
        jobId={job.id}
        officeUserId={officeOwnerId ?? job.user_id}
      />
    </>
  );
};

export default EngineerJobCard;
