import { useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2 } from "lucide-react";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onDone: (data: any) => void;
}

const CompleteSheet = ({ job, customer, onClose, onDone }: Props) => {
  const [workDone, setWorkDone] = useState("");
  const [parts, setParts] = useState("");
  const [nextService, setNextService] = useState("12 months");
  const [followUp, setFollowUp] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [officeNote, setOfficeNote] = useState("");

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" /> Complete Job
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{customer.name} · {customer.address}</div>
      </div>
      <div className="px-5 pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What was done? *</Label>
          <Textarea rows={3} value={workDone} onChange={(e) => setWorkDone(e.target.value)}
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
          <Textarea rows={2} value={officeNote} onChange={(e) => setOfficeNote(e.target.value)}
            placeholder="Anything the office should know…" />
        </div>

        <Button
          className="w-full h-12 text-base font-extrabold bg-success hover:bg-success/90 text-success-foreground gap-2"
          disabled={!workDone.trim()}
          onClick={() => onDone({ workDone, parts, nextService, followUp, followUpNote, officeNote })}
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
