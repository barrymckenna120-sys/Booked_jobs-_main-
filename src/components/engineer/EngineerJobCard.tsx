import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, StickyNote, Camera, Eye, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompleteSheet from "./CompleteSheet";
import CancelSheet from "./CancelSheet";
import NoteSheet from "./NoteSheet";
import PhotoSheet from "./PhotoSheet";
import JobDetailSheet from "./JobDetailSheet";
import ExtraWorkSheet from "./ExtraWorkSheet";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  Scheduled:     { color: "text-primary",     bg: "bg-primary/10",     label: "Scheduled" },
  Booked:        { color: "text-primary",     bg: "bg-primary/10",     label: "Booked" },
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
}

const EngineerJobCard = ({ job, customer, onUpdate, isNextJob = false }: EngineerJobCardProps) => {
  const navigate = useNavigate();
  const [showDetail, setShowDetail] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showExtraWork, setShowExtraWork] = useState(false);

  const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.Scheduled;
  const isDone = job.status === "Completed" || job.status === "Cancelled";
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
        className={`bg-card rounded-2xl border border-l-4 p-4 mb-3 transition-all ${isDone ? "opacity-70" : ""} ${isNextJob ? "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20 shadow-md" : "border-border"}`}
        style={{ borderLeftColor: `hsl(var(--${job.job_type === "Emergency" ? "destructive" : job.status === "In Progress" ? "warning" : job.status === "Completed" ? "success" : job.status === "Cancelled" ? "destructive" : "primary"}))` }}
      >
        {/* Next Job Badge */}
        {isNextJob && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full animate-pulse">
              ▶ Next Job
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-1">
          <div className="flex-1">
            <div className="text-[11px] font-bold text-muted-foreground tracking-wider mb-0.5">{getJobRef(job.id)}</div>
            <div className="text-base font-extrabold text-foreground leading-tight">{customer.name}</div>
          </div>
          <span className={`${s.bg} ${s.color} rounded-full px-3 py-0.5 text-[11px] font-bold shrink-0 ml-2`}>
            {s.label}
          </span>
        </div>

        {/* Address */}
        <div className="text-[13px] text-muted-foreground mb-2">📍 {customer.address}</div>

        {/* Pills */}
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground">
            ⏰ {timeLabel}
          </span>
          <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground">
            🔧 {job.job_type}
          </span>
          {job.boiler_brand && (
            <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground">
              ♨️ {job.boiler_brand}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border border-border ${
              job.deposit_paid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            {job.deposit_paid ? "💳 Paid" : "⏳ Pending"}
          </span>
        </div>

        {/* Issue */}
        {job.boiler_issue && (
          <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-lg p-2.5 mb-3 text-[13px] text-foreground leading-snug">
            ⚠ {job.boiler_issue}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-2 mb-2.5">
          <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9" onClick={openPhone}>
            <Phone className="w-3.5 h-3.5" /> Call
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9 text-success" onClick={openWhatsApp}>
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9 text-primary" onClick={openNav}>
            <MapPin className="w-3.5 h-3.5" /> Nav
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9" onClick={() => navigate(`/engineer/job/${job.id}`)}>
            <Eye className="w-3.5 h-3.5" /> Details
          </Button>
        </div>

        {/* Secondary actions */}
        {!isDone && (
          <div className="flex gap-2 mb-2.5">
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9" onClick={() => setShowNote(true)}>
              <StickyNote className="w-3.5 h-3.5" /> Note
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9" onClick={() => setShowPhotos(true)}>
              <Camera className="w-3.5 h-3.5" /> Photo
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs h-9" onClick={() => setShowExtraWork(true)}>
              ＋ Extra Work
            </Button>
          </div>
        )}

        {/* Primary actions */}
        {(job.status === "Scheduled" || job.status === "Booked") && (
          <Button className="w-full h-12 text-base font-extrabold gap-2" onClick={() => onUpdate(job.id, { status: "In Progress" })}>
            ▶ Start Job
          </Button>
        )}

        {job.status === "In Progress" && (
          <div className="flex gap-2.5">
            <Button
              className="flex-[2] h-12 text-base font-extrabold gap-2 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => setShowComplete(true)}
            >
              ✔ Complete
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12 text-destructive border-destructive/30 font-bold"
              onClick={() => setShowCancel(true)}
            >
              ✕
            </Button>
          </div>
        )}

        {job.status === "Completed" && (
          <div className="bg-success/10 rounded-xl p-3 flex items-center gap-2">
            <span className="text-lg">✔</span>
            <div className="text-[13px] font-bold text-success">Completed</div>
          </div>
        )}
      </div>

      {showDetail && <JobDetailSheet job={job} customer={customer} onClose={() => setShowDetail(false)} onStart={(id: string) => onUpdate(id, { status: "In Progress" })} />}
      {showComplete && <CompleteSheet job={job} customer={customer} onClose={() => setShowComplete(false)} onDone={(data: any) => { onUpdate(job.id, { status: "Completed", ...data }); setShowComplete(false); }} />}
      {showCancel && <CancelSheet job={job} customer={customer} onClose={() => setShowCancel(false)} onDone={(reason: string, note: string) => { onUpdate(job.id, { status: "Cancelled", cancelReason: reason, cancelNote: note }); setShowCancel(false); }} />}
      {showNote && <NoteSheet job={job} customer={customer} onClose={() => setShowNote(false)} onSave={(note: string) => { onUpdate(job.id, { notes: note }); setShowNote(false); }} />}
      {showPhotos && <PhotoSheet job={job} customer={customer} onClose={() => setShowPhotos(false)} onSave={() => setShowPhotos(false)} />}
      {showExtraWork && <ExtraWorkSheet job={job} customer={customer} onClose={() => setShowExtraWork(false)} />}
    </>
  );
};

export default EngineerJobCard;
