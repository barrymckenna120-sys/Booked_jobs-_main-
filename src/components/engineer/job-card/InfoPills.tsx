import { Clock, Wrench, Flame, CreditCard, Hourglass, CalendarDays } from "lucide-react";
import { format } from "date-fns";

const TIME_LABELS: Record<string, string> = {
  "9–11": "9am–11am",
  "11–2": "11am–1pm",
  "2–5":  "2pm–5pm",
};

interface InfoPillsProps {
  timeBlock: string | null;
  jobType: string;
  boilerBrand?: string | null;
  depositPaid?: boolean;
  scheduledDate?: string | null;
}

const InfoPills = ({ timeBlock, jobType, boilerBrand, depositPaid, scheduledDate }: InfoPillsProps) => {
  const timeLabel = TIME_LABELS[timeBlock || ""] || timeBlock || "—";

  const formattedDate = scheduledDate
    ? format(new Date(scheduledDate + "T00:00:00"), "EEE d MMM")
    : null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <span className="bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 text-xs font-bold text-primary flex items-center gap-1">
        <CalendarDays className="w-3 h-3" /> {formattedDate ? `${formattedDate} · ${timeLabel}` : timeLabel}
      </span>
      <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
        <Wrench className="w-3 h-3 text-muted-foreground" /> {jobType}
      </span>
      {boilerBrand && (
        <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
          <Flame className="w-3 h-3 text-muted-foreground" /> {boilerBrand}
        </span>
      )}
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border border-border flex items-center gap-1 ${
          depositPaid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
        }`}
      >
        {depositPaid ? <><CreditCard className="w-3 h-3" /> Paid</> : <><Hourglass className="w-3 h-3" /> Pending</>}
      </span>
    </div>
  );
};

export default InfoPills;
