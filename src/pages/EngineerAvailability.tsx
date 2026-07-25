import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Calendar, Clock, Wrench } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Map display index to DB day_of_week (0=Sun,1=Mon,...6=Sat)
const DAY_DB_MAP = [1, 2, 3, 4, 5, 6, 0];

const TIME_BLOCKS = ["9–11", "11–2", "2–5"];

interface Engineer {
  id: string;
  name: string;
  phone: string | null;
  is_available: boolean;
  rgi_number: string | null;
}

interface WorkingDay {
  id: string;
  engineer_id: string;
  day_of_week: number;
  is_working: boolean;
}

interface Block {
  id: string;
  engineer_id: string;
  block_type: string;
  block_date: string;
  end_date: string | null;
  time_block: string | null;
  reason: string | null;
}

const EngineerAvailability = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEngineer, setSelectedEngineer] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({
    block_type: "slot" as "slot" | "holiday",
    block_date: "",
    end_date: "",
    time_block: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [engRes, wdRes, blRes] = await Promise.all([
      supabase.from("engineers").select("*").eq("status", "active").order("name"),
      supabase.from("engineer_working_days").select("*"),
      supabase.from("engineer_blocks").select("*").order("block_date", { ascending: true }),
    ]);
    if (engRes.data) setEngineers(engRes.data);
    if (wdRes.data) setWorkingDays(wdRes.data as WorkingDay[]);
    if (blRes.data) setBlocks(blRes.data as Block[]);
    if (!selectedEngineer && engRes.data?.length) {
      setSelectedEngineer(engRes.data[0].id);
    }
    setLoading(false);
  }, [user, selectedEngineer]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  const toggleWorkingDay = async (engineerId: string, dayIndex: number) => {
    if (!user) return;
    const dbDay = DAY_DB_MAP[dayIndex];
    const existing = workingDays.find(
      (wd) => wd.engineer_id === engineerId && wd.day_of_week === dbDay
    );

    if (existing) {
      const newVal = !existing.is_working;
      await supabase
        .from("engineer_working_days")
        .update({ is_working: newVal } as any)
        .eq("id", existing.id);
      setWorkingDays((prev) =>
        prev.map((wd) => (wd.id === existing.id ? { ...wd, is_working: newVal } : wd))
      );
    } else {
      // No record = default working. Create as NOT working.
      const { data } = await supabase
        .from("engineer_working_days")
        .insert({
          engineer_id: engineerId,
          user_id: user.id,
          day_of_week: dbDay,
          is_working: false,
        } as any)
        .select()
        .single();
      if (data) setWorkingDays((prev) => [...prev, data as WorkingDay]);
    }
  };

  const isDayWorking = (engineerId: string, dayIndex: number): boolean => {
    const dbDay = DAY_DB_MAP[dayIndex];
    const record = workingDays.find(
      (wd) => wd.engineer_id === engineerId && wd.day_of_week === dbDay
    );
    return record ? record.is_working : true; // default = working
  };

  const addBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedEngineer) return;
    if (!blockForm.block_date) {
      toast({ title: "Date required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("engineer_blocks").insert({
      engineer_id: selectedEngineer,
      user_id: user.id,
      block_type: blockForm.block_type,
      block_date: blockForm.block_date,
      end_date: blockForm.block_type === "holiday" && blockForm.end_date ? blockForm.end_date : null,
      time_block: blockForm.block_type === "slot" && blockForm.time_block ? blockForm.time_block : null,
      reason: blockForm.reason || null,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: blockForm.block_type === "holiday" ? "Holiday added" : "Slot blocked" });
      setBlockForm({ block_type: "slot", block_date: "", end_date: "", time_block: "", reason: "" });
      setBlockDialogOpen(false);
      fetchAll();
    }
  };

  const removeBlock = async (blockId: string) => {
    await supabase.from("engineer_blocks").delete().eq("id", blockId);
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    toast({ title: "Block removed" });
  };

  const currentEngineer = engineers.find((e) => e.id === selectedEngineer);
  const currentBlocks = blocks.filter((b) => b.engineer_id === selectedEngineer);
  const slotBlocks = currentBlocks.filter((b) => b.block_type === "slot");
  const holidays = currentBlocks.filter((b) => b.block_type === "holiday");

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Engineer Availability</h1>
          <p className="text-sm text-muted-foreground">Manage working days, blocked slots &amp; holidays</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : engineers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No engineers found. Add engineers in Settings first.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Engineer selector */}
          <div className="flex flex-wrap gap-2">
            {engineers.map((eng) => (
              <Button
                key={eng.id}
                variant={selectedEngineer === eng.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedEngineer(eng.id)}
                className="gap-2"
              >
                <Wrench className="w-4 h-4" />
                <span className="flex flex-col items-start leading-tight">
                  <span>{eng.name}</span>
                  {eng.rgi_number && <span className="text-[10px] font-normal text-muted-foreground">RGI: {eng.rgi_number}</span>}
                </span>
              </Button>
            ))}
          </div>

          {currentEngineer && (
            <>
              {/* RGI Number */}
              <Card className="shadow-sm">
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                    RGI Number — {currentEngineer.name}
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      value={currentEngineer.rgi_number ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEngineers((prev) =>
                          prev.map((eng) =>
                            eng.id === currentEngineer.id ? { ...eng, rgi_number: val || null } : eng
                          )
                        );
                      }}
                      placeholder="e.g. 12345"
                      className="max-w-xs"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        const { error } = await supabase
                          .from("engineers")
                          .update({ rgi_number: currentEngineer.rgi_number } as any)
                          .eq("id", currentEngineer.id);
                        if (error) {
                          toast({ title: "Error saving RGI", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: "RGI number saved" });
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Working Days */}
              <Card className="shadow-sm">
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-4">
                    Working Days — {currentEngineer.name}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {DAYS.map((day, i) => {
                      const working = isDayWorking(currentEngineer.id, i);
                      return (
                        <button
                          key={day}
                          onClick={() => toggleWorkingDay(currentEngineer.id, i)}
                          className={`w-14 h-14 rounded-lg border-2 flex flex-col items-center justify-center text-sm font-bold transition-colors ${
                            working
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {day}
                          <span className="text-[10px] font-normal">{working ? "On" : "Off"}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Block Slot / Holiday */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Blocked Slots &amp; Holidays</h2>
                <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                      <Plus className="w-4 h-4" /> Add Block
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Block Time for {currentEngineer.name}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={addBlock} className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Type</Label>
                        <Select
                          value={blockForm.block_type}
                          onValueChange={(v) =>
                            setBlockForm((f) => ({ ...f, block_type: v as "slot" | "holiday" }))
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value="slot">Block Time Slot</SelectItem>
                            <SelectItem value="holiday">Holiday Range</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">
                            {blockForm.block_type === "holiday" ? "Start Date" : "Date"} *
                          </Label>
                          <Input
                            type="date"
                            value={blockForm.block_date}
                            onChange={(e) => setBlockForm((f) => ({ ...f, block_date: e.target.value }))}
                            required
                          />
                        </div>
                        {blockForm.block_type === "holiday" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">End Date</Label>
                            <Input
                              type="date"
                              value={blockForm.end_date}
                              onChange={(e) => setBlockForm((f) => ({ ...f, end_date: e.target.value }))}
                            />
                          </div>
                        )}
                        {blockForm.block_type === "slot" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Time Block</Label>
                            <Select
                              value={blockForm.time_block}
                              onValueChange={(v) => setBlockForm((f) => ({ ...f, time_block: v }))}
                            >
                              <SelectTrigger><SelectValue placeholder="All day" /></SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                <SelectItem value="all_day">All Day</SelectItem>
                                <SelectItem value="9–11">9–11</SelectItem>
                                <SelectItem value="11–2">11–2</SelectItem>
                                <SelectItem value="2–5">2–5</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Reason (optional)</Label>
                        <Input
                          value={blockForm.reason}
                          onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))}
                          placeholder="e.g. Doctor appointment"
                          maxLength={200}
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setBlockDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                          Add Block
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Blocked Slots list */}
              {slotBlocks.length > 0 && (
                <Card className="shadow-sm">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Blocked Slots
                    </p>
                    <div className="space-y-2">
                      {slotBlocks.map((b) => (
                        <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-foreground">{b.block_date}</span>
                            <Badge variant="outline" className="text-xs">
                              {b.time_block === "all_day" || !b.time_block ? "All Day" : b.time_block}
                            </Badge>
                            {b.reason && <span className="text-xs text-muted-foreground">{b.reason}</span>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeBlock(b.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Holidays list */}
              {holidays.length > 0 && (
                <Card className="shadow-sm">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Holidays
                    </p>
                    <div className="space-y-2">
                      {holidays.map((b) => (
                        <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-warning/5 border border-warning/20">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-foreground">
                              {b.block_date}{b.end_date ? ` → ${b.end_date}` : ""}
                            </span>
                            {b.reason && <span className="text-xs text-muted-foreground">{b.reason}</span>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeBlock(b.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {currentBlocks.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    No blocked slots or holidays for {currentEngineer.name}.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default EngineerAvailability;
