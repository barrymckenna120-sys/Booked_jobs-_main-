import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RenewalStatusPill, DaysPill } from "./RenewalStatusPill";
import DeliveryStatusBadge from "@/components/comms/DeliveryStatusBadge";


type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  eircode: string;
  last_service_date: string | null;
  next_service_due: string | null;
  assigned_engineer: string | null;
};

type Props = {
  customer: Customer | null;
  status: string;
  daysUntil: number;
  reminderSent: boolean;
  open: boolean;
  onClose: () => void;
  onSendReminder: () => void;
  onBook: () => void;
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};

const RenewalDetailSheet = ({ customer, status, daysUntil, reminderSent, open, onClose, onSendReminder, onBook }: Props) => {
  if (!customer) return null;

  const details = [
    { label: "Phone", value: customer.phone },
    { label: "Eircode", value: customer.eircode },
    { label: "Last Service", value: formatDate(customer.last_service_date) },
    { label: "Next Due", value: formatDate(customer.next_service_due), alert: status === "Overdue" },
    { label: "Engineer", value: customer.assigned_engineer || "—" },
    { label: "Reminder", value: reminderSent ? "✓ Sent" : "Not sent yet", ok: reminderSent },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{customer.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">📍 {customer.address}</p>
            <div className="flex gap-2 mt-2">
              <RenewalStatusPill status={status} />
              <DaysPill days={daysUntil} />
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {details.map((d) => (
              <div key={d.label} className="bg-muted/50 rounded-lg border border-border p-3">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-1">{d.label}</div>
                <div className={`text-sm font-semibold ${d.alert ? "text-destructive" : d.ok ? "text-success" : ""}`}>{d.value}</div>
              </div>
            ))}
          </div>

          {/* Reminder preview */}
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-3">
            <div className="text-xs font-bold text-warning mb-2">📋 Reminder Message Preview</div>
            <div className="bg-card rounded-lg p-3 text-sm font-mono leading-relaxed">
              Hi {customer.name.split(" ")[0]},<br />
              Your annual boiler service is due on <strong>{formatDate(customer.next_service_due)}</strong>.<br />
              Reply YES to confirm or call us. Karl's Gas 🔥
            </div>
          </div>

          {/* Delivery status for the last reminder we tried to send */}
          <DeliveryStatusBadge commType="service_reminder" relatedId={customer.id} />

          {/* Actions */}

          <div className="space-y-2.5">
            {!reminderSent ? (
              <Button className="w-full" onClick={() => { onSendReminder(); onClose(); }}>
                📲 Send WhatsApp Reminder
              </Button>
            ) : (
              <div className="bg-success/10 border border-success/30 rounded-xl p-3 text-center">
                <span className="text-sm font-bold text-success">✓ Reminder sent</span>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={onBook}>
              📅 Book Service
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RenewalDetailSheet;
