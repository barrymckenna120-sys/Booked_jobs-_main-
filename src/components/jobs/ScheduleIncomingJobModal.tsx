import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";

const DEFAULT_TIME_BLOCKS = ["9am–11am", "11am–1pm", "2pm–5pm"];

const formatTimeLabel = (start: string, end: string) => {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return m ? `${h12}:${m.toString().padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
};

const buildTimeBlocks = (blocks: any[]): string[] => {
  if (!blocks || blocks.length === 0) return DEFAULT_TIME_BLOCKS;
  return blocks.map((s: any) => formatTimeLabel(s.start || "09:00", s.end || "17:00"));
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  customerName?: string;
  onScheduled?: () => void;
};

const ScheduleIncomingJobModal = ({ open, onOpenChange, jobId, customerName, onScheduled }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [date, setDate] = useState<string>("");
  const [block, setBlock] = useState<string>("");
  const [engineerId, setEngineerId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setDate("");
      setBlock("");
      setEngineerId("");
    }
  }, [open]);

  // Time blocks from settings
  const { data: settingsBlocks } = useQuery({
    queryKey: ["slot-settings-blocks"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("job_time_blocks").limit(1).single();
      return (data?.job_time_blocks as any[] | null) || [];
    },
  });
  const TIME_BLOCKS = buildTimeBlocks(settingsBlocks || []);

  // Active engineers
  const { data: engineers = [] } = useQuery({
    queryKey: ["active-engineers", user?.id],
    queryFn: async () => {
      if (!user) return [] as { id: string; name: string }[];
      const { data } = await supabase
        .from("engineers")
        .select("id, name, status")
        .eq("status", "active")
        .eq("status", "active")
        .order("name");
      return (data || []) as { id: string; name: string; status: string }[];
    },
    enabled: !!user && open,
  });

  // Next 14 days options
  const dateOptions = Array.from({ length: 14 }).map((_, i) => {
    const d = addDays(new Date(), i);
    return {
      value: format(d, "yyyy-MM-dd"),
      label: format(d, "EEE d MMM"),
    };
  });

  const canConfirm = !!date && !!block && !!engineerId && !!jobId && !saving;

  const handleConfirm = async () => {
    if (!canConfirm || !jobId) return;
    setSaving(true);

    const eng = engineers.find((e) => e.id === engineerId);
    const engineerName = eng?.name || "";

    const { error } = await supabase
      .from("service_calls")
      .update(sanitizeServiceCallUpdatePayload({
        scheduled_date: `${date}T12:00:00`,
        time_block: block,
        assigned_engineer_id: engineerId,
        assigned_engineer: engineerName,
        status: "Booked",
      }))
      .eq("id", jobId);

    if (error) {
      setSaving(false);
      toast({ title: "Failed to schedule", description: error.message, variant: "destructive" });
      return;
    }

    // Fire WhatsApp booking confirmation (non-blocking)
    supabase.functions.invoke("send-booking-confirmation", {
      body: { service_call_id: jobId },
    }).catch((err) => console.error("Booking confirmation failed:", err));

    toast({ title: "Job scheduled", description: `${customerName || "Job"} booked with ${engineerName}` });
    setSaving(false);
    onOpenChange(false);
    onScheduled?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Job{customerName ? ` — ${customerName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger><SelectValue placeholder="Select a date" /></SelectTrigger>
              <SelectContent className="bg-popover z-50 max-h-72">
                {dateOptions.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Time Block</Label>
            <Select value={block} onValueChange={setBlock}>
              <SelectTrigger><SelectValue placeholder="Select a time block" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {TIME_BLOCKS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Engineer</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger><SelectValue placeholder="Select an engineer" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {engineers.length === 0 ? (
                  <SelectItem value="__none" disabled>No active engineers</SelectItem>
                ) : engineers.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {saving ? "Scheduling…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleIncomingJobModal;
