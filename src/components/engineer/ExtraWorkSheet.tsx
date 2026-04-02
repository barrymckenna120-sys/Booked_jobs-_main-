import { useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const getJobRef = (job: any) => job?.job_reference || `KN-${job?.id?.slice(0, 6).toUpperCase() || '???'}`;

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
}

const ExtraWorkSheet = ({ job, customer, onClose }: Props) => {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    setSaving(true);

    const { error } = await supabase.from("quotes").insert({
      job_id: job.id,
      customer_id: job.customer_id,
      user_id: job.user_id,
      description: `Extra work: ${description}`,
      total_amount: parseFloat(amount),
      status: "Pending Approval",
    });

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Extra work submitted", description: `${getJobRef(job)}-Q · €${amount}` });
      onClose();
    }
  };

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground">＋ Extra Work</div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{getJobRef(job.id)} · {customer.name}</div>
      </div>
      <div className="px-5 pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description *</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Replace expansion vessel, fit new PRV…" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount € *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 180" />
        </div>
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-xs text-muted-foreground">
          This creates a quote linked to <strong>{getJobRef(job.id)}</strong> with status <strong>Pending Approval</strong>. Office will review before sending.
        </div>
        <Button
          className="w-full h-12 text-base font-extrabold"
          disabled={!description.trim() || !amount || saving}
          onClick={handleSubmit}
        >
          {saving ? "Submitting…" : "Submit Extra Work"}
        </Button>
        <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">Cancel</button>
      </div>
    </EngineerSheet>
  );
};

export default ExtraWorkSheet;
