import { useState, useRef } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TAG_OPTIONS = [
  { name: "New Boiler Fitted", colour: "#4A86E8" },
  { name: "New Boiler Soon", colour: "#F59E0B" },
  { name: "Under Warranty", colour: "#10B981" },
];

const JOB_TYPES = [
  { label: "Service", colour: "#4A86E8", prefix: "Boiler serviced" },
  { label: "Repair", colour: "#F59E0B", prefix: "Repair completed" },
  { label: "Install", colour: "#10B981", prefix: "New boiler fitted" },
];

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (data: any, jobTagDate: string | null) => void;
}

const CompleteSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [workDone, setWorkDone] = useState("");
  const [userHasTyped, setUserHasTyped] = useState(false);
  const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
  const [parts, setParts] = useState("");
  const workDoneRef = useRef<HTMLTextAreaElement>(null);

  const handleJobType = (label: string) => {
    setSelectedJobType(label);
    if (userHasTyped && workDone.trim()) return;
    const jt = JOB_TYPES.find((j) => j.label === label)!;
    const today = format(new Date(), "d MMM yyyy");
    const text = `${jt.prefix} –  – ${today}`;
    setWorkDone(text);
    setTimeout(() => {
      const ta = workDoneRef.current;
      if (ta) {
        const cursor = jt.prefix.length + 3; // after "prefix – "
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      }
    }, 0);
  };

  const handleWorkDoneChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setWorkDone(e.target.value);
    setUserHasTyped(true);
  };
  const [nextService, setNextService] = useState("12 months");
  const [followUp, setFollowUp] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [officeNote, setOfficeNote] = useState("");
  const [boilerMake, setBoilerMake] = useState<string>(customer?.boiler_brand ?? "");
  const [boilerModel, setBoilerModel] = useState<string>(customer?.boiler_model ?? "");
  const [warrantyExpiry, setWarrantyExpiry] = useState<string>(customer?.warranty_expiry_date ?? "");
  // Per-visit only — always starts blank, never carried over from a previous job.
  const [customerNotes, setCustomerNotes] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [jobTagDate, setJobTagDate] = useState<string | null>(null);

  const TAGS_NEEDING_DATE = ["New Boiler Fitted", "New Boiler Soon", "Under Warranty"];
  const showTagDatePicker = selectedTags.some((t) => TAGS_NEEDING_DATE.includes(t));

  const toggleTag = (name: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name];
      if (!next.some((t) => TAGS_NEEDING_DATE.includes(t))) {
        setJobTagDate(null);
      }
      return next;
    });
  };

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" /> Complete Job
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{customer.name} · {customer.address}</div>
      </div>
      <div className="px-5 pt-4 space-y-4">
        {/* Job Type Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {JOB_TYPES.map((jt) => {
              const isSelected = selectedJobType === jt.label;
              return (
                <button
                  key={jt.label}
                  type="button"
                  onClick={() => handleJobType(jt.label)}
                  className="min-h-[48px] rounded-full text-sm font-bold transition-all border-2"
                  style={{
                    borderColor: jt.colour,
                    backgroundColor: isSelected ? jt.colour : "transparent",
                    color: isSelected ? "#fff" : jt.colour,
                    boxShadow: isSelected ? `0 2px 8px ${jt.colour}40` : "none",
                  }}
                >
                  {jt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What was done? *</Label>
          <Textarea ref={workDoneRef} rows={3} value={workDone} onChange={handleWorkDoneChange}
            placeholder="e.g. Annual service completed, cleaned heat exchanger…" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parts used (optional)</Label>
          <Input value={parts} onChange={(e) => setParts(e.target.value)} placeholder="e.g. Ignition lead, pressure relief valve" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next service</Label>
          <Select value={nextService} onValueChange={setNextService}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-[600]">
              <SelectItem value="6 months">6 months</SelectItem>
              <SelectItem value="12 months">12 months</SelectItem>
              <SelectItem value="18 months">18 months</SelectItem>
              <SelectItem value="2 years">2 years</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between bg-secondary rounded-xl border border-border p-3.5">
          <div>
            <div className="text-sm font-bold text-foreground">Follow-up needed?</div>
            <div className="text-xs text-muted-foreground">Parts on order or re-visit required</div>
          </div>
          <Switch checked={followUp} onCheckedChange={setFollowUp} />
        </div>

        {followUp && (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Follow-up detail</Label>
            <Textarea rows={2} value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)}
              placeholder="e.g. Part ordered, return next week…" />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes for office</Label>
          <div className="rounded-md border border-input bg-background overflow-hidden">
            <Textarea
              rows={2}
              value={officeNote}
              onChange={(e) => setOfficeNote(e.target.value)}
              placeholder="Anything the office should know…"
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
            />
            <Separator className="bg-border" />
            <div className="px-3 py-2.5 space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Tag this job:</span>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all border"
                      style={{
                        borderColor: isSelected ? tag.colour : "hsl(var(--border))",
                        backgroundColor: isSelected ? tag.colour : "transparent",
                        color: isSelected ? "#fff" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {showTagDatePicker && (
                <div className="pt-2">
                  <Label className="text-[11px] font-medium text-muted-foreground mb-1 block">Tag date *</Label>
                  <input
                    type="date"
                    value={jobTagDate ?? ""}
                    min={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => {
                      const val = e.target.value;
                      setJobTagDate(val || null);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2"
          disabled={!workDone.trim() || (showTagDatePicker && !jobTagDate)}
          onClick={() => onDone({ workDone, parts, nextService, followUp, followUpNote, officeNote, selectedTags, selectedJobType }, jobTagDate)}
        >
          <CheckCircle2 className="w-5 h-5" /> Mark as Complete
        </Button>
        <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">
          Cancel
        </button>
      </div>
    </EngineerSheet>
  );
};

export default CompleteSheet;
