import { Clock, Wrench, Flame, CreditCard, Hourglass } from "lucide-react";

const TIME_LABELS: Record<string, string> = {
  "9–11": "9–11am",
  "11–2": "11am–1pm",
  "2–5":  "2–5pm",
};

interface InfoPillsProps {
  timeBlock: string | null;
  jobType: string;
  boilerBrand?: string | null;
  depositPaid?: boolean;
}

const InfoPills = ({ timeBlock, jobType, boilerBrand, depositPaid }: InfoPillsProps) => {
  const timeLabel = TIME_LABELS[timeBlock || ""] || timeBlock || "—";

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
        <Clock className="w-3 h-3 text-muted-foreground" /> {timeLabel}
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
