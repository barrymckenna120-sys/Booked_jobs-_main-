import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<any[]>([]);
  const [date, setDate] = useState("");
  const [timeBlock, setTimeBlock] = useState("Morning");
  const [engineer, setEngineer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("engineers").select("*").eq("user_id", user.id).eq("is_available", true)
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
    const { error } = await supabase.from("service_calls").insert({
      user_id: user.id,
      customer_id: customer.id,
      job_type: "Boiler Service",
      status: "Scheduled",
      scheduled_date: date,
      time_block: timeBlock,
      assigned_engineer: engineer || null,
      assigned_engineer_id: matchedEng?.id || null,
      notes: notes || null,
      source: "Renewal",
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error creating booking", variant: "destructive" });
    } else {
      // Update customer scheduled_service_date
      await supabase.from("customers").update({
        scheduled_service_date: date,
        service_status: "Up to Date",
      }).eq("id", customer.id);
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
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
