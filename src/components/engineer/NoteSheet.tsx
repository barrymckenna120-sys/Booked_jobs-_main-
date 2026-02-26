import { useState } from "react";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Save } from "lucide-react";

interface Props {
  job: any;
  customer: any;
  onClose: () => void;
  onSave: (note: string) => void;
}

const NoteSheet = ({ job, customer, onClose, onSave }: Props) => {
  const [note, setNote] = useState(job.notes || "");

  return (
    <EngineerSheet onClose={onClose}>
      <div className="px-5 py-3 border-b border-border">
        <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Add Note
        </div>
        <div className="text-[13px] text-muted-foreground mt-0.5">{customer.name}</div>
      </div>
      <div className="px-5 pt-4 space-y-3.5">
        <Textarea
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter your note here — visible to office…"
          className="text-[15px]"
          autoFocus
        />
        <Button className="w-full h-12 text-base font-extrabold gap-2" onClick={() => onSave(note)}>
          <Save className="w-5 h-5" /> Save Note
        </Button>
        <button onClick={onClose} className="w-full text-center text-muted-foreground text-sm font-semibold py-1">
          Cancel
        </button>
      </div>
    </EngineerSheet>
  );
};

export default NoteSheet;
