import { Button } from "@/components/ui/button";
import { RenewalStatusPill, DaysPill } from "./RenewalStatusPill";
import { formatDistanceToNow, isToday } from "date-fns";
import { PhoneOff, MessageCircle, CheckCircle2, CalendarCheck, Wallet, Send, MapPin } from "lucide-react";

type RenewalCustomer = {
  id: string;
  name: string;
  address: string;
  last_service_date: string | null;
  next_service_due: string | null;
  assigned_engineer: string | null;
  reminder_30_days_sent: boolean | null;
};

type Props = {
  customer: RenewalCustomer;
  status: string;
  stage?: string;
  daysUntil: number;
  reminderSent: boolean;
  lastContacted: string | null;
  onOpen: () => void;
  onSendReminder: () => void;
  onBook: () => void;
};

const STAGE_DISPLAY: Record<string, { label: string; Icon: React.ComponentType<any>; textClass: string; bgClass: string }> = {
  not_contacted: { label: "Not Contacted", Icon: PhoneOff,      textClass: "text-destructive",  bgClass: "bg-destructive/10" },
  reminded:      { label: "Reminded",      Icon: MessageCircle, textClass: "text-warning",      bgClass: "bg-warning/10" },
  confirmed:     { label: "Confirmed",     Icon: CheckCircle2,  textClass: "text-[#0891B2]",    bgClass: "bg-[#CFFAFE]" },
  booked:        { label: "Booked In",     Icon: CalendarCheck, textClass: "text-primary",      bgClass: "bg-primary/10" },
  paid:          { label: "Paid",          Icon: Wallet,        textClass: "text-success",      bgClass: "bg-success/10" },
};

const borderColorMap: Record<string, string> = {
  Overdue: "border-l-destructive",
  "Due Soon": "border-l-warning",
  "Up to Date": "border-l-success",
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};

const formatDueDate = (d: string | null, status: string) => {
  if (!d) return { text: "—", className: "" };
  const text = new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  if (status === "Overdue") return { text, className: "text-destructive font-bold" };
  if (status === "Due Soon") return { text, className: "text-warning font-semibold" };
  return { text, className: "text-success font-semibold" };
};

const formatLastContacted = (d: string | null) => {
  if (!d) return { text: "Never", className: "text-destructive/70" };
  const date = new Date(d);
  if (isToday(date)) return { text: "Today ✓", className: "text-success font-semibold" };
  return {
    text: formatDistanceToNow(date, { addSuffix: true }),
    className: "text-muted-foreground",
    title: formatDate(d),
  };
};

const RenewalCard = ({ customer, status, stage, daysUntil, reminderSent, lastContacted, onOpen, onSendReminder, onBook }: Props) => {
  const leftBorder = borderColorMap[status] || "border-l-success";
  const dueDate = formatDueDate(customer.next_service_due, status);
  const contacted = formatLastContacted(lastContacted);
  const stageConfig = stage ? STAGE_DISPLAY[stage] : null;
  const StageIcon = stageConfig?.Icon;

  return (
    <div className={`bg-card border border-border border-l-4 ${leftBorder} rounded-xl p-4 mb-3 ${reminderSent ? "opacity-75" : ""}`}>
      {/* Top row */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="text-base font-extrabold">{customer.name}</div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" /> {customer.address}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
          <RenewalStatusPill status={status} />
          <DaysPill days={daysUntil} />
          {stageConfig && StageIcon && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${stageConfig.bgClass} ${stageConfig.textClass}`}>
              <StageIcon className="w-3 h-3" />
              {stageConfig.label}
            </span>
          )}
        </div>
      </div>

      {/* Dates row */}
      <div className="flex gap-4 bg-muted/50 rounded-lg p-2.5 mb-3 border border-border text-xs">
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Due Date</div>
          <div className={dueDate.className}>{dueDate.text}</div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Last Service</div>
          <div className="font-semibold">{formatDate(customer.last_service_date)}</div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Last Contacted</div>
          <div className={contacted.className} title={contacted.title}>{contacted.text}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={reminderSent ? "outline" : "default"}
          className="flex-1 text-xs gap-1"
          onClick={onSendReminder}
        >
          {reminderSent ? (
            <><MessageCircle className="w-3 h-3" /> Resend</>
          ) : (
            <><Send className="w-3 h-3" /> Send Reminder</>
          )}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={onBook}>
          <CalendarCheck className="w-3 h-3" /> Book
        </Button>
      </div>
    </div>
  );
};

export default RenewalCard;
