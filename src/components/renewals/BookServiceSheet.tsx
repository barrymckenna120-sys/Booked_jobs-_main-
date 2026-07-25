import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";

type Customer = {
  id: string;
  name: string;
  eircode: string;
  assigned_engineer: string | null;
};

type Props = {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onBooked: () => void;
};

const TIME_BLOCKS = [
  { value: "Morning", label: "9–11am" },
  { value: "Midday", label: "11am–2pm" },
  { value: "Afternoon", label: "2–5pm" },
];

const BookServiceSheet = ({ customer, open, onClose, onBooked }: Props) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<any[]>([]);
  const [date, setDate] = useState("");
  const [timeBlock, setTimeBlock] = useState("Morning");
  const [engineer, setEngineer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("engineers").select("*").eq("user_id", user.id).eq("status", "active").eq("is_available", true)
        .then(({ data }) => setEngineers(data || []));
    }
  }, [user]);

  useEffect(() => {
    if (customer) {
      setEngineer(customer.assigned_engineer || "");
      setDate("");
      setNotes("");
      setTimeBlock("Morning");
    }
  }, [customer]);

  if (!customer) return null;

  const handleBook = async () => {
    if (!user || !date) {
      toast({ title: "Please select a date", variant: "destructive" });
      return;
    }
    setSaving(true);
    const matchedEng = engineers.find((e: any) => e.name === engineer);
    const { data: insertedRow, error } = await supabase.from("service_calls").insert({
      user_id: user.id,
      organisation_id: orgId!,
      customer_id: customer.id,
      job_type: "Boiler Service",
      status: "Scheduled",
      scheduled_date: date,
      time_block: timeBlock,
      assigned_engineer: engineer || null,
      assigned_engineer_id: matchedEng?.id || null,
      notes: notes || null,
      source: "Renewal",
    } as any).select('id').single();
    setSaving(false);
    if (error) {
      toast({ title: "Error creating booking", variant: "destructive" });
    } else {
      if (insertedRow?.id) {
        supabase.functions.invoke('send-booking-confirmation', {
          body: { service_call_id: insertedRow.id }
        }).catch(err => console.error('Booking confirmation failed:', err));
      }
      // Update customer scheduled_service_date
      await supabase.from("customers").update({
        scheduled_service_date: date,
        service_status: "Up to Date",
      }).eq("id", customer.id);
      logAudit({ action_type: "job_created", entity_type: "service_call", entity_id: customer.id, detail: `Boiler service booked for ${customer.name} on ${date}` });
      toast({ title: `Service booked for ${customer.name}` });
      onBooked();
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Book Service</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mb-4">{customer.name} · {customer.eircode}</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Preferred Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(new Date(date + "T12:00:00"), "dd/MM/yyyy") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date ? new Date(date + "T12:00:00") : undefined}
                  onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : "")}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Time Block</Label>
            <div className="flex gap-2">
              {TIME_BLOCKS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setTimeBlock(b.value)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    timeBlock === b.value
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Engineer</Label>
            <Select value={engineer} onValueChange={setEngineer}>
              <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
              <SelectContent>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Notes</Label>
            <textarea
              rows={3}
              placeholder="Any notes for the engineer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button className="w-full" onClick={handleBook} disabled={saving}>
            ✅ Confirm Booking
          </Button>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BookServiceSheet;
