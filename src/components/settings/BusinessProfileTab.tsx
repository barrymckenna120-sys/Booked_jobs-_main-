import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Plus } from "lucide-react";

interface OpeningHour {
  day: string;
  enabled: boolean;
  start: string;
  end: string;
}

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

const BusinessProfileTab = ({ settings, onSave, saving }: Props) => {
  const [hours, setHours] = useState<OpeningHour[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [newArea, setNewArea] = useState("");
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [depositPercentage, setDepositPercentage] = useState(50);

  useEffect(() => {
    if (settings) {
      setHours(settings.opening_hours || [
        { day: "Mon", enabled: true, start: "08:00", end: "17:00" },
        { day: "Tue", enabled: true, start: "08:00", end: "17:00" },
        { day: "Wed", enabled: true, start: "08:00", end: "17:00" },
        { day: "Thu", enabled: true, start: "08:00", end: "17:00" },
        { day: "Fri", enabled: true, start: "08:00", end: "17:00" },
        { day: "Sat", enabled: true, start: "09:00", end: "13:00" },
        { day: "Sun", enabled: false, start: "09:00", end: "13:00" },
      ]);
      setAreas(settings.service_areas || ["D15", "D6", "K67"]);
      setBlocks(settings.job_time_blocks || [
        { label: "Morning", start: "09:00", end: "11:00", max_jobs: 2 },
        { label: "Midday", start: "11:00", end: "14:00", max_jobs: 2 },
        { label: "Afternoon", start: "14:00", end: "17:00", max_jobs: 2 },
      ]);
      setDepositPercentage(settings.deposit_percentage ?? 50);
    }
  }, [settings]);

  const updateHour = (idx: number, field: string, value: any) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  const updateBlock = (idx: number, field: string, value: any) => {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  const addArea = () => {
    const trimmed = newArea.trim().toUpperCase();
    if (trimmed && !areas.includes(trimmed)) {
      setAreas((prev) => [...prev, trimmed]);
      setNewArea("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Opening Hours */}
      <Card>
        <CardHeader><CardTitle className="text-base">Opening Hours</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3">
              <span className="w-10 text-sm font-medium">{h.day}</span>
              <Switch checked={h.enabled} onCheckedChange={(v) => updateHour(i, "enabled", v)} />
              <Input type="time" value={h.start} onChange={(e) => updateHour(i, "start", e.target.value)} disabled={!h.enabled} className="w-28" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="time" value={h.end} onChange={(e) => updateHour(i, "end", e.target.value)} disabled={!h.enabled} className="w-28" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Service Areas */}
      <Card>
        <CardHeader><CardTitle className="text-base">Service Areas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Add Eircode prefix (e.g. D15)" className="flex-1" onKeyDown={(e) => e.key === "Enter" && addArea()} />
            <Button variant="outline" size="icon" onClick={addArea}><Plus className="w-4 h-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <Badge key={area} variant="secondary" className="gap-1 text-sm">
                {area}
                <button onClick={() => setAreas((p) => p.filter((a) => a !== area))} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Used to validate incoming Tally bookings</p>
        </CardContent>
      </Card>

      {/* Job Time Blocks */}
      <Card>
        <CardHeader><CardTitle className="text-base">Job Time Blocks</CardTitle></CardHeader>
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

      {/* Payments */}
      <Card>
        <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="deposit-pct" className="text-sm font-medium">Default Deposit Percentage</Label>
            <div className="relative mt-1.5 w-32">
              <Input
                id="deposit-pct"
                type="number"
                value={depositPercentage}
                onChange={(e) => setDepositPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                min={0}
                max={100}
                step={1}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              This is the deposit % applied when generating quotes and payment requests.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => onSave({ opening_hours: hours, service_areas: areas, job_time_blocks: blocks, deposit_percentage: depositPercentage })} disabled={saving} className="w-full md:w-auto">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Business Profile
      </Button>
    </div>
  );
};

export default BusinessProfileTab;
