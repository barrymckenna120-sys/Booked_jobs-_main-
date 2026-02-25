import { Button } from "@/components/ui/button";
import { RenewalStatusPill, DaysPill } from "./RenewalStatusPill";

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
  daysUntil: number;
  reminderSent: boolean;
  onOpen: () => void;
  onSendReminder: () => void;
  onBook: () => void;
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

const RenewalCard = ({ customer, status, daysUntil, reminderSent, onOpen, onSendReminder, onBook }: Props) => {
  const leftBorder = borderColorMap[status] || "border-l-success";

  return (
    <div className={`bg-card border border-border border-l-4 ${leftBorder} rounded-xl p-4 mb-3`}>
      {/* Top row */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="text-base font-extrabold">{customer.name}</div>
          <div className="text-xs text-muted-foreground truncate">📍 {customer.address}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
          <RenewalStatusPill status={status} />
          <DaysPill days={daysUntil} />
        </div>
      </div>

      {/* Dates row */}
      <div className="flex gap-4 bg-muted/50 rounded-lg p-2.5 mb-3 border border-border text-xs">
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Last Service</div>
          <div className="font-semibold">{formatDate(customer.last_service_date)}</div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Next Due</div>
          <div className={`font-semibold ${status === "Overdue" ? "text-destructive" : ""}`}>
            {formatDate(customer.next_service_due)}
          </div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">Engineer</div>
          <div className="font-semibold">👷 {customer.assigned_engineer?.split(" ").pop() || "—"}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={reminderSent ? "outline" : "default"}
          className="flex-1 text-xs"
          disabled={reminderSent}
          onClick={onSendReminder}
        >
          {reminderSent ? "✓ Reminder Sent" : "📲 Send Reminder"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={onBook}>
          📅 Book
        </Button>
      </div>
    </div>
  );
};

export default RenewalCard;
