import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";

interface Props {
  customerId: string;
  onCountReady?: (count: number) => void;
  collapsed?: boolean;
}

type ActivityType = "note_inbound_call" | "note_outbound_call" | "note_general";

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "note_inbound_call", label: "Inbound Call" },
  { value: "note_outbound_call", label: "Outbound Call" },
  { value: "note_general", label: "Note" },
];

const PILL_CONFIG: Record<string, { label: string; className: string }> = {
  note_inbound_call: { label: "Inbound Call", className: "bg-blue-100 text-blue-700" },
  note_outbound_call: { label: "Outbound Call", className: "bg-green-100 text-green-700" },
  note_general: { label: "Note", className: "bg-muted text-muted-foreground" },
  job_booked: { label: "Job Booked", className: "bg-purple-100 text-purple-700" },
  job_completed: { label: "Job Completed", className: "bg-green-100 text-green-700" },
  payment_received: { label: "Payment Received", className: "bg-emerald-100 text-emerald-700" },
  payment_failed: { label: "Payment Failed", className: "bg-destructive/10 text-destructive" },
  certificate_sent: { label: "Certificate Sent", className: "bg-blue-100 text-blue-700" },
  whatsapp_sent: { label: "WhatsApp", className: "bg-orange-100 text-orange-700" },
  whatsapp_received: { label: "WhatsApp", className: "bg-orange-100 text-orange-700" },
  // BJ-0070 — parts lifecycle entries, one per transition.
  part_logged: { label: "Part Logged", className: "bg-[#FEF3C7] text-[#D97706]" },
  part_ordered: { label: "Part Ordered", className: "bg-blue-100 text-blue-700" },
  part_ready: { label: "Part Ready to Fit", className: "bg-[#F3E8FF] text-[#7C3AED]" },
  part_fitted: { label: "Part Fitted", className: "bg-[#DCFCE7] text-[#15803D]" },
  part_cancelled: { label: "Part Cancelled", className: "bg-muted text-muted-foreground" },
};

/** Detail line for parts entries — keeps the part readable months later. */
const partDetailLine = (data: any): string | null => {
  if (!data || typeof data !== "object") return null;
  const bits: string[] = [];
  if (data.quantity) bits.push(`Qty ${data.quantity}`);
  if (data.priority) bits.push(`${String(data.priority)} priority`);
  if (data.job_reference) bits.push(String(data.job_reference));
  if (data.logged_by_name) bits.push(`logged by ${data.logged_by_name}`);
  return bits.length > 0 ? bits.join(" · ") : null;
};

const CustomerActivityTimeline = ({ customerId, onCountReady, collapsed = false }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityType>("note_general");
  const [noteText, setNoteText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("organisation_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setOrgId(data?.organisation_id ?? null);
    })();
  }, [user]);

  const fetchActivities = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("customer_activity")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (data) {
      setActivities(data);
      onCountReady?.(data.length);
      const ids = [...new Set(data.map((a) => a.created_by).filter(Boolean))];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p) => {
            map[p.id] = p.display_name || "Staff";
          });
          setProfileMap(map);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchActivities();
  }, [customerId]);

  const handleSave = async () => {
    if (!noteText.trim() || !user) return;
    if (!orgId) {
      toast({ title: "Organisation not found", description: "Please refresh and try again.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("customer_activity").insert({
      customer_id: customerId,
      organisation_id: orgId,
      event_type: selectedType,
      event_label: noteText.trim(),
      created_by: profile?.id || null,
    });

    setSaving(false);
    if (error) {
      toast({ title: "Error saving activity", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Activity logged" });
      setNoteText("");
      setSelectedType("note_general");
      setOpen(false);
      fetchActivities();
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}`;
  };

  const displayedActivities = showAll ? activities : activities.slice(0, 5);

  return (
    <>
      <div>
        <div className="flex items-center justify-end mb-3">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Log Activity
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No activity logged yet</p>
        ) : (
          <div className="space-y-2">
            {displayedActivities.map((a) => {
              const pill = PILL_CONFIG[a.event_type] || PILL_CONFIG.note_general;
              const partDetail = String(a.event_type ?? "").startsWith("part_")
                ? partDetailLine(a.event_data)
                : null;
              return (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${pill.className}`}>{pill.label}</span>
                    </div>
                    <p className="text-foreground text-[13px] mt-1">{a.event_label}</p>
                    {partDetail && <p className="text-[11px] text-muted-foreground mt-0.5">{partDetail}</p>}
                    {partDetail && a.event_data?.notes && (
                      <p className="text-[11px] text-foreground/75 mt-0.5 italic">“{a.event_data.notes}”</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span>{formatTimestamp(a.created_at)}</span>
                      {a.created_by && profileMap[a.created_by] && (
                        <>
                          <span>·</span>
                          <span>{profileMap[a.created_by]}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {activities.length > 5 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-sm font-medium text-primary hover:underline w-full text-center py-2"
              >
                Show all {activities.length} activities
              </button>
            )}
            {showAll && activities.length > 5 && (
              <button
                onClick={() => setShowAll(false)}
                className="text-sm font-medium text-muted-foreground hover:underline w-full text-center py-2"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>

      {/* Log Activity Bottom Sheet */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Log Activity</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Type</Label>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedType(opt.value)}
                    className={`flex-1 flex items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                      selectedType === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add note</Label>
              <Input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="What happened?"
                className="text-sm"
              />
            </div>
          </div>
          <DrawerFooter>
            <Button onClick={handleSave} disabled={!noteText.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default CustomerActivityTimeline;
