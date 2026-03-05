import { useState } from "react";
import { MapPin, AlertTriangle, Play, CheckCircle2, CreditCard, Receipt } from "lucide-react";
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
import TakePaymentModal from "@/components/payments/TakePaymentModal";
import StatusBadge from "./job-card/StatusBadge";
import InfoPills from "./job-card/InfoPills";
import QuickActions from "./job-card/QuickActions";
import SecondaryActions from "./job-card/SecondaryActions";
import PrimaryActions from "./job-card/PrimaryActions";
import { Button } from "@/components/ui/button";

const getJobRef = (id: string) => `BJ-${id.slice(0, 6).toUpperCase()}`;

interface EngineerJobCardProps {
  job: any;
  customer: any;
  onUpdate: (jobId: string, patch: Record<string, any>) => void;
  isNextJob?: boolean;
  photos?: { url: string; name: string }[];
}

const EngineerJobCard = ({ job, customer, onUpdate, isNextJob = false, photos = [] }: EngineerJobCardProps) => {
  const { toast } = useToast();
  const [showDetail, setShowDetail] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);
  const [showPartsNeeded, setShowPartsNeeded] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showTakePayment, setShowTakePayment] = useState(false);
  const [completeData, setCompleteData] = useState<any>(null);

  const isDone = job.status === "Completed" || job.status === "Cancelled" || job.status === "no_show" || job.status === "parts_needed";
  const isActive = ["En Route", "On Site", "In Progress"].includes(job.status);

  const borderLeftColor = `hsl(var(--${
    job.job_type === "Emergency" ? "destructive" :
    isActive ? "warning" :
    job.status === "Completed" ? "success" :
    job.status === "Cancelled" ? "destructive" : "primary"
  }))`;

  return (
    <>
      <div
        className={`bg-card rounded-2xl border border-l-4 p-5 mb-4 transition-all ${isDone ? "opacity-50 grayscale-[30%]" : ""} ${isNextJob ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20 shadow-md" : "border-border/60"}`}
        style={{ borderLeftColor }}
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
            <div className="text-[11px] font-bold text-muted-foreground/60 tracking-wider mb-1">{getJobRef(job.id)}</div>
            <div className="text-[17px] font-extrabold text-foreground leading-tight">{customer.name}</div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {/* Address */}
        <div className="text-[13px] text-muted-foreground/70 mb-3 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" /> {[customer.address, customer.eircode].filter(Boolean).join(", ")}
        </div>

        <InfoPills timeBlock={job.time_block} jobType={job.job_type} boilerBrand={job.boiler_brand} depositPaid={job.deposit_paid} />

        {/* Issue */}
        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-lg p-3 mb-4 text-[13px] text-foreground leading-snug flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" /> {job.boiler_issue}
          </div>
        )}

        <QuickActions jobId={job.id} customerPhone={customer.phone} customerAddress={customer.address} customerEircode={customer.eircode} />

        {!isDone && (
          <SecondaryActions
            isActive={isActive}
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
                onClick={() => window.location.href = `/receipt/${job.id}`}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-bold text-sm"
              >
                <Receipt className="w-4 h-4" /> {job.receipt_number}
              </button>
            ) : (
              <Button
                className="w-full h-12 text-sm font-extrabold gap-2"
                onClick={() => {
                  if (job.receipt_number) {
                    toast({ title: "Payment already taken" });
                    return;
                  }
                  setShowTakePayment(true);
                }}
              >
                <CreditCard className="w-4 h-4" /> Take Payment
              </Button>
            )}
          </div>
        )}
      </div>

      {showDetail && <JobDetailSheet job={job} customer={customer} onClose={() => setShowDetail(false)} onStart={(id: string) => onUpdate(id, { status: "In Progress" })} />}
      {showComplete && <CompleteSheet job={job} customer={customer} onClose={() => setShowComplete(false)} onDone={(data: any) => { setCompleteData(data); setShowComplete(false); setShowPayment(true); }} />}
      {showPayment && <PaymentSheet job={job} customer={customer} onClose={() => { setShowPayment(false); setCompleteData(null); }} onDone={(method: string) => { onUpdate(job.id, { status: "Completed", ...completeData, paymentMethod: method }); setShowPayment(false); setCompleteData(null); }} />}
      {showCancel && <CancelSheet job={job} customer={customer} onClose={() => setShowCancel(false)} onDone={(reason: string, note: string) => { onUpdate(job.id, { status: "Cancelled", cancelReason: reason, cancelNote: note }); setShowCancel(false); }} />}
      {showNote && <NoteSheet job={job} customer={customer} onClose={() => setShowNote(false)} onSave={(note: string) => { onUpdate(job.id, { notes: note }); setShowNote(false); }} />}
      {showPhotos && <MediaSheet job={job} customer={customer} onClose={() => setShowPhotos(false)} onSave={() => setShowPhotos(false)} />}
      {showExtraWork && <ExtraWorkSheet job={job} customer={customer} onClose={() => setShowExtraWork(false)} />}
      <NoShowSheet open={showNoShow} onClose={() => setShowNoShow(false)} onConfirm={(reason, notes) => { onUpdate(job.id, { status: "no_show", notes: `No Show: ${reason}${notes ? ` — ${notes}` : ""}` }); setShowNoShow(false); }} />
      <PartsNeededSheet open={showPartsNeeded} onClose={() => setShowPartsNeeded(false)} onConfirm={(notes) => { onUpdate(job.id, { status: "parts_needed", notes: notes ? `Parts Needed: ${notes}` : "Parts Needed" }); setShowPartsNeeded(false); }} />
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
    </>
  );
};

export default EngineerJobCard;
