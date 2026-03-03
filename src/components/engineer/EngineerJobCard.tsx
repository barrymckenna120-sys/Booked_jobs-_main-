import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, StickyNote, Camera, Eye, MessageCircle, Clock, Wrench, Flame, CreditCard, Hourglass, AlertTriangle, Car, CheckCircle2, XCircle, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompleteSheet from "./CompleteSheet";
import CancelSheet from "./CancelSheet";
import NoteSheet from "./NoteSheet";
import MediaSheet from "./MediaSheet";
import JobDetailSheet from "./JobDetailSheet";
import ExtraWorkSheet from "./ExtraWorkSheet";
import JobPhotoThumbnails from "./JobPhotoThumbnails";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:     { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:        { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
  "En Route":    { color: "text-warning",     bg: "bg-warning/10",     label: "En Route" },
  "On Site":     { color: "text-warning",     bg: "bg-warning/10",     label: "On Site" },
  "In Progress": { color: "text-warning",     bg: "bg-warning/10",     label: "In Progress" },
  Completed:     { color: "text-success",      bg: "bg-success/10",     label: "Completed" },
  Cancelled:     { color: "text-destructive",  bg: "bg-destructive/10", label: "Cancelled" },
};

const TIME_LABELS: Record<string, string> = {
  "9–11": "9–11am",
  "11–2": "11am–1pm",
  "2–5":  "2–5pm",
};

const getJobRef = (id: string) => `BJ-${id.slice(0, 6).toUpperCase()}`;

interface EngineerJobCardProps {
  job: any;
  customer: any;
  onUpdate: (jobId: string, patch: Record<string, any>) => void;
  isNextJob?: boolean;
  photos?: { url: string; name: string }[];
}

const EngineerJobCard = ({ job, customer, onUpdate, isNextJob = false, photos = [] }: EngineerJobCardProps) => {
  const navigate = useNavigate();
  const [showDetail, setShowDetail] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);

  const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.Scheduled;
  const isDone = job.status === "Completed" || job.status === "Cancelled";
  const isActive = ["En Route", "On Site", "In Progress"].includes(job.status);
  const timeLabel = TIME_LABELS[job.time_block] || job.time_block || "—";

  const openPhone = () => window.open(`tel:${customer.phone}`);
  const openWhatsApp = () => window.open(`https://wa.me/${customer.phone?.replace(/[^0-9]/g, "")}`, "_blank");
  const openNav = () =>
    window.open(
      `https://maps.google.com/?q=${encodeURIComponent(customer.address + " " + customer.eircode + " Ireland")}`,
      "_blank"
    );

  return (
    <>
      <div
        className={`bg-card rounded-2xl border border-l-4 p-5 mb-4 transition-all ${isDone ? "opacity-60" : ""} ${isNextJob ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20 shadow-md" : "border-border/60"}`}
        style={{ borderLeftColor: `hsl(var(--${job.job_type === "Emergency" ? "destructive" : ["En Route", "On Site", "In Progress"].includes(job.status) ? "warning" : job.status === "Completed" ? "success" : job.status === "Cancelled" ? "destructive" : "primary"}))` }}
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
          <span className={`${s.bg} ${s.color} rounded-full px-3 py-0.5 text-[11px] font-bold shrink-0 ml-2`}>
            {s.label}
          </span>
        </div>

        {/* Address */}
        <div className="text-[13px] text-muted-foreground/70 mb-3 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 shrink-0" /> {[customer.address, customer.eircode].filter(Boolean).join(", ")}
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" /> {timeLabel}
          </span>
          <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
            <Wrench className="w-3 h-3 text-muted-foreground" /> {job.job_type}
          </span>
          {job.boiler_brand && (
            <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
              <Flame className="w-3 h-3 text-muted-foreground" /> {job.boiler_brand}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border border-border flex items-center gap-1 ${
              job.deposit_paid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            {job.deposit_paid ? <><CreditCard className="w-3 h-3" /> Paid</> : <><Hourglass className="w-3 h-3" /> Pending</>}
          </span>
        </div>

        {/* Issue */}
        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-lg p-3 mb-4 text-[13px] text-foreground leading-snug flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" /> {job.boiler_issue}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-2.5 mb-3">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={openPhone}>
            <Phone className="w-3.5 h-3.5" /> Call
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11 text-success" onClick={openWhatsApp}>
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11 text-primary" onClick={openNav}>
            <MapPin className="w-3.5 h-3.5" /> Nav
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={() => navigate(`/engineer/job/${job.id}`)}>
            <Eye className="w-3.5 h-3.5" /> Details
          </Button>
        </div>

        {/* Secondary actions */}
        {!isDone && (
          <div className="flex gap-2.5 mb-3">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={() => setShowNote(true)}>
              <StickyNote className="w-3.5 h-3.5" /> Note
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={() => setShowPhotos(true)}>
              <Camera className="w-3.5 h-3.5" /> Media
            </Button>
            {isActive && (
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs h-11" onClick={() => setShowExtraWork(true)}>
                <Plus className="w-3.5 h-3.5" /> Extra Work
              </Button>
            )}
          </div>
        )}

        {/* Primary actions */}
        {(job.status === "Scheduled" || job.status === "Booked") && (
          <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1" onClick={() => onUpdate(job.id, { status: "En Route" })}>
            <Car className="w-5 h-5" /> En Route
          </Button>
        )}

        {job.status === "En Route" && (
          <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => onUpdate(job.id, { status: "On Site" })}>
            <MapPin className="w-5 h-5" /> Arrived On Site
          </Button>
        )}

        {job.status === "On Site" && (
          <Button className="w-full h-[52px] text-base font-extrabold gap-2 mt-1 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => onUpdate(job.id, { status: "In Progress" })}>
            <Play className="w-5 h-5" /> Start Work
          </Button>
        )}

        {job.status === "In Progress" && (
          <div className="flex gap-3 mt-1">
            <Button
              className="flex-[2] h-[52px] text-base font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setShowComplete(true)}
            >
              <CheckCircle2 className="w-5 h-5" /> Complete
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-[52px] text-destructive border-destructive/30 font-bold"
              onClick={() => setShowCancel(true)}
            >
              <XCircle className="w-5 h-5" />
            </Button>
          </div>
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
      </div>

      {showDetail && <JobDetailSheet job={job} customer={customer} onClose={() => setShowDetail(false)} onStart={(id: string) => onUpdate(id, { status: "In Progress" })} />}
      {showComplete && <CompleteSheet job={job} customer={customer} onClose={() => setShowComplete(false)} onDone={(data: any) => { onUpdate(job.id, { status: "Completed", ...data }); setShowComplete(false); }} />}
      {showCancel && <CancelSheet job={job} customer={customer} onClose={() => setShowCancel(false)} onDone={(reason: string, note: string) => { onUpdate(job.id, { status: "Cancelled", cancelReason: reason, cancelNote: note }); setShowCancel(false); }} />}
      {showNote && <NoteSheet job={job} customer={customer} onClose={() => setShowNote(false)} onSave={(note: string) => { onUpdate(job.id, { notes: note }); setShowNote(false); }} />}
      {showPhotos && <MediaSheet job={job} customer={customer} onClose={() => setShowPhotos(false)} onSave={() => setShowPhotos(false)} />}
      {showExtraWork && <ExtraWorkSheet job={job} customer={customer} onClose={() => setShowExtraWork(false)} />}
    </>
  );
};

export default EngineerJobCard;
