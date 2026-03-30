import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface TimeBlock {
  label: string;
  start: string;
  end: string;
  max_jobs: number;
}

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const JobTimeBlocksSection = ({ settings, onSave, saving }: Props) => {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);

  useEffect(() => {
    if (settings) {
      setBlocks(settings.job_time_blocks || [
        { label: "Morning", start: "09:00", end: "11:00", max_jobs: 2 },
        { label: "Midday", start: "11:00", end: "14:00", max_jobs: 2 },
        { label: "Afternoon", start: "14:00", end: "17:00", max_jobs: 2 },
      ]);
    }
  }, [settings]);

  const updateBlock = (idx: number, field: string, value: any) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Scheduling Blocks</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {blocks.map((b, i) => (
            <div key={b.label} className="flex items-center gap-3 flex-wrap">
              <span className="w-20 text-sm font-medium">{b.label}</span>
              <Input type="time" value={b.start} onChange={(e) => updateBlock(i, "start", e.target.value)} className="w-28" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="time" value={b.end} onChange={(e) => updateBlock(i, "end", e.target.value)} className="w-28" />
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Max jobs</Label>
                <Input type="number" value={b.max_jobs} onChange={(e) => updateBlock(i, "max_jobs", parseInt(e.target.value) || 1)} className="w-16" min={1} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={() => onSave({ job_time_blocks: blocks })} disabled={saving} className="w-full md:w-auto">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Time Blocks
      </Button>
    </div>
  );
};

export default JobTimeBlocksSection;
