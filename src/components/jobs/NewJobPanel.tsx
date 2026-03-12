import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, ChevronLeft, Loader2, Check, Plus, Phone, MapPin, Flame, Wrench, AlertTriangle, Settings, Sunrise, Sun, CloudSun, FileText, CreditCard, CheckCircle2, MessageCircle, CalendarDays, HardHat, Bell, ClipboardList, PartyPopper, XCircle } from "lucide-react";
import { format } from "date-fns";
import { validationBorderClass, ValidationMessage } from "@/components/shared/FormValidation";
import FormLeaveGuard from "@/components/shared/FormLeaveGuard";

/* ── Types ─────────────────────────────────────────────── */
interface NewJobPanelProps {
  onClose: () => void;
  prefilledCustomer?: any;
  prefilledDate?: string;
  prefilledBlock?: string;
  prefilledEngineer?: string;
  prefilledJobType?: string;
}

const JOB_TYPES = [
  { id: "Boiler Service", label: "Boiler Service", Icon: Flame, price: 120 },
  { id: "Repair", label: "Repair", Icon: Wrench, price: 0 },
  { id: "Emergency", label: "Emergency", Icon: AlertTriangle, price: 150 },
  { id: "Installation", label: "Installation", Icon: Settings, price: 0 },
];

const TIME_BLOCKS = [
  { id: "9–11", label: "9–11am", Icon: Sunrise, dbValue: "9am–11am" },
  { id: "11–2", label: "11am–2pm", Icon: Sun, dbValue: "11am–1pm" },
  { id: "2–5", label: "2–5pm", Icon: CloudSun, dbValue: "2pm–5pm" },
];

const PAYMENT_OPTIONS = [
  { id: "unpaid", label: "Invoice After", Icon: FileText },
  { id: "deposit", label: "Deposit Taken", Icon: CreditCard },
  { id: "paid", label: "Paid in Full", Icon: CheckCircle2 },
];

/* ── Step Bar ──────────────────────────────────────────── */
const StepBar = ({ step }: { step: number }) => {
  const labels = ["Customer", "Job", "Schedule", "Payment"];
  return (
    <div className="flex items-center gap-0 px-1 pb-4">
      {labels.map((l, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center" style={{ flex: i < labels.length - 1 ? 1 : "none" }}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all ${
                done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
              }`}>
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${active ? "font-bold text-primary" : done ? "font-medium text-success" : "text-muted-foreground"}`}>{l}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 mb-4 transition-colors ${done ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ── STEP 1: Customer ──────────────────────────────────── */
const BOILER_BRANDS = [
  "Vaillant", "Worcester Bosch", "Ideal", "Baxi", "Viessmann", "Potterton",
  "Glow-worm", "Ferroli", "Ariston", "Grant", "Alpha", "Honeywell", "Heatline",
];

const StepCustomer = ({ prefilledCustomer, onNext }: { prefilledCustomer?: any; onNext: (c: any) => void }) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(prefilledCustomer || null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [eircode, setEircode] = useState("");
  const [boiler, setBoiler] = useState("");
  const [boilerDropdownOpen, setBoilerDropdownOpen] = useState(false);
  const [boilerSearch, setBoilerSearch] = useState("");

  const { data: results = [] } = useQuery({
    queryKey: ["customer-search", search],
    queryFn: async () => {
      if (!search.trim() || search.length < 2) return [];
      const q = `%${search}%`;
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, address, eircode, boiler_make_model")
        .or(`name.ilike.${q},phone.ilike.${q},eircode.ilike.${q},address.ilike.${q}`)
        .limit(5);
      return data || [];
    },
    enabled: !selected && !isNew && search.length >= 2,
  });

  const canProceed = selected ? true : isNew && name.trim() && phone.trim() && address.trim();

  const handleNext = () => {
    if (isNew) {
      onNext({ id: "NEW", name, phone, address, eircode, boilerType: boiler, isNew: true });
    } else {
      onNext(selected);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {/* Search */}
        {!isNew && !prefilledCustomer && (
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Search existing customer</Label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                placeholder="Name, phone, Eircode or address…"
                className="pl-9"
              />
            </div>

            {results.length > 0 && !selected && (
              <div className="mt-1.5 border border-primary rounded-xl overflow-hidden shadow-lg">
                {results.map((c: any, i: number) => (
                  <div
                    key={c.id}
                    onClick={() => { setSelected(c); setSearch(c.name); }}
                    className={`px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors flex justify-between items-center ${
                      i < results.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">{c.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.phone} · {c.eircode}</div>
                      <div className="text-[11px] text-muted-foreground/70">{c.address}</div>
                    </div>
                    <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Existing</Badge>
                  </div>
                ))}
              </div>
            )}

            {search.length > 1 && results.length === 0 && !selected && (
              <div className="mt-1.5 bg-warning/10 border border-warning/30 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-warning">
                No customer found — create new below
              </div>
            )}
          </div>
        )}

        {/* Selected customer card */}
        {selected && !isNew && (
          <div className="bg-success/10 border border-success/30 rounded-2xl p-4 relative">
            <div className="text-[10px] font-bold uppercase tracking-wider text-success mb-2 flex items-center gap-1"><Check className="w-3 h-3" /> Customer Found</div>
            <div className="text-[17px] font-extrabold mb-1">{selected.name}</div>
            <div className="text-[13px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {selected.phone}</div>
            <div className="text-[13px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {selected.address}</div>
            {selected.eircode && <div className="text-xs text-muted-foreground/70 mt-1">Eircode: {selected.eircode}</div>}
            {(selected.boiler_make_model || selected.boilerType) && <div className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1"><Flame className="w-3 h-3" /> {selected.boiler_make_model || selected.boilerType}</div>}
            {!prefilledCustomer && (
              <button onClick={() => { setSelected(null); setSearch(""); }} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"><XCircle className="w-4 h-4" /></button>
            )}
          </div>
        )}

        {/* New customer toggle */}
        {!prefilledCustomer && !selected && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">or new customer</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button variant={isNew ? "default" : "outline"} className="w-full gap-2 font-bold" onClick={() => setIsNew((v) => !v)}>
              {isNew ? "▲ Hide form" : <><Plus className="w-4 h-4" /> Add New Customer</>}
            </Button>
          </>
        )}

        {/* New customer form */}
        {isNew && !prefilledCustomer && (
          <div className="space-y-3">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Full Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Niamh Lawlor" className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mobile Number <span className="text-destructive">*</span></Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+353 87 123 4567" className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Address <span className="text-destructive">*</span></Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Green Park, Dublin 15" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Eircode</Label>
                <Input value={eircode} onChange={(e) => setEircode(e.target.value.toUpperCase())} placeholder="D15A1B2" className="mt-1" />
              </div>
              <div className="relative">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Make</Label>
                <div className="relative mt-1">
                  <Input
                    value={boilerDropdownOpen ? boilerSearch : boiler}
                    onChange={(e) => {
                      setBoilerSearch(e.target.value);
                      setBoiler(e.target.value);
                      if (!boilerDropdownOpen) setBoilerDropdownOpen(true);
                    }}
                    onFocus={() => { setBoilerDropdownOpen(true); setBoilerSearch(boiler); }}
                    placeholder="e.g. Vaillant"
                  />
                  {boilerDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {BOILER_BRANDS.filter(b => b.toLowerCase().includes((boilerDropdownOpen ? boilerSearch : boiler).toLowerCase())).map(b => (
                        <button
                          key={b}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setBoiler(b); setBoilerSearch(b); setBoilerDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors ${boiler === b ? "font-bold text-primary bg-primary/5" : ""}`}
                        >
                          {b}
                        </button>
                      ))}
                      {boilerSearch.trim() && !BOILER_BRANDS.some(b => b.toLowerCase() === boilerSearch.toLowerCase()) && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setBoiler(boilerSearch.trim()); setBoilerDropdownOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5 border-t border-border"
                        >
                          Use "<span className="font-semibold text-foreground">{boilerSearch.trim()}</span>"
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {boilerDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setBoilerDropdownOpen(false)} />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pt-4 pb-2 border-t border-border">
        <Button className="w-full h-12 font-extrabold text-base" disabled={!canProceed} onClick={handleNext}>
          {canProceed ? `Continue with ${selected?.name || name} →` : "Select or add a customer"}
        </Button>
      </div>
    </div>
  );
};

/* ── STEP 2: Job Details ───────────────────────────────── */
const StepJob = ({ prefilledType, prefilledBoiler, onNext, onBack }: { prefilledType?: string; prefilledBoiler?: string; onNext: (j: any) => void; onBack: () => void }) => {
  const [jobType, setJobType] = useState(prefilledType || "Boiler Service");
  const [notes, setNotes] = useState("");
  const [boiler, setBoiler] = useState(prefilledBoiler || "");
  const [jobTypeError, setJobTypeError] = useState(false);
  const isUrgent = jobType === "Emergency";

  const handleNext = () => {
    if (!jobType) {
      setJobTypeError(true);
      return;
    }
    onNext({ jobType, isUrgent, notes, boilerModel: boiler });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Job Type</Label>
          <div className={`grid grid-cols-2 gap-2.5 mt-1.5 rounded-xl ${jobTypeError ? "ring-2 ring-[#F59E0B] p-1" : ""}`}>
            {JOB_TYPES.map((j) => (
              <button
                key={j.id}
                onClick={() => { setJobType(j.id); setJobTypeError(false); }}
                className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  jobType === j.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <j.Icon className={`w-6 h-6 ${jobType === j.id ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[13px] ${jobType === j.id ? "font-extrabold text-primary" : "font-semibold"}`}>{j.label}</span>
                {j.price > 0 && <span className={`text-[11px] font-semibold ${jobType === j.id ? "text-primary" : "text-muted-foreground"}`}>€{j.price}</span>}
              </button>
            ))}
          </div>
          <ValidationMessage show={jobTypeError} />
        </div>

        {isUrgent && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div>
              <div className="text-[13px] font-extrabold text-destructive">Emergency Job</div>
              <div className="text-xs text-muted-foreground">Will appear at top of schedule in purple</div>
            </div>
          </div>
        )}

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Make / Model</Label>
          <Input value={boiler} onChange={(e) => setBoiler(e.target.value)} placeholder="e.g. Vaillant ecoFIT Pure 25kW" className="mt-1" />
          <p className="text-[11px] text-muted-foreground mt-1">Leave blank if unknown</p>
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notes from the call</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pilot light going out, dog in back garden…" className="mt-1" />
        </div>
      </div>

      <div className="px-5 pt-4 pb-2 border-t border-border flex gap-2.5">
        <Button variant="outline" onClick={onBack} className="font-bold">← Back</Button>
        <Button className="flex-1 h-12 font-extrabold text-base" onClick={handleNext}>
          Schedule this job →
        </Button>
      </div>
    </div>
  );
};

/* ── STEP 3: Schedule ──────────────────────────────────── */
const StepSchedule = ({ prefilledDate, prefilledBlock, prefilledEngineer, onNext, onBack }: {
  prefilledDate?: string; prefilledBlock?: string; prefilledEngineer?: string;
  onNext: (s: any) => void; onBack: () => void;
}) => {
  const todayISO = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(prefilledDate || todayISO);
  const [block, setBlock] = useState(prefilledBlock || "9–11");
  const [engineer, setEngineer] = useState(prefilledEngineer || "");
  const [errors, setErrors] = useState<{ date?: boolean; block?: boolean; engineer?: boolean }>({});
  const [holidayBlock, setHolidayBlock] = useState<{ engineerName: string } | null>(null);

  const { data: engineers = [] } = useQuery({
    queryKey: ["engineers-for-new-job"],
    queryFn: async () => {
      const { data } = await supabase.from("engineers").select("id, name, status").eq("status", "active");
      return data || [];
    },
  });

  const dbBlock = TIME_BLOCKS.find((t) => t.id === block)?.dbValue || block;

  // Get job counts for selected date + block per engineer
  const { data: slotCounts = {} } = useQuery({
    queryKey: ["slot-counts", date, dbBlock],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("assigned_engineer_id")
        .eq("scheduled_date", date)
        .eq("time_block", dbBlock)
        .not("status", "in", "(Cancelled)");
      const counts: Record<string, number> = {};
      (data || []).forEach((j: any) => { if (j.assigned_engineer_id) counts[j.assigned_engineer_id] = (counts[j.assigned_engineer_id] || 0) + 1; });
      return counts;
    },
    enabled: !!date && !!block,
  });

  // Total slot capacity check from settings.job_time_blocks
  const { data: slotMaxJobs } = useQuery({
    queryKey: ["slot-max-jobs"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("job_time_blocks").limit(1).single();
      return (data?.job_time_blocks as any[] | null) || [];
    },
  });

  const totalSlotJobs = Object.values(slotCounts as Record<string, number>).reduce((a, b) => a + b, 0);
  const slotConfig = (slotMaxJobs || []).find((s: any) => {
    const label = (s.label || "").toLowerCase();
    const blockLabel = (TIME_BLOCKS.find((t) => t.id === block)?.label || "").toLowerCase();
    // Match by label or by start/end times
    if (label === blockLabel) return true;
    const dbVal = TIME_BLOCKS.find((t) => t.id === block)?.dbValue || "";
    return dbVal === `${s.start}–${s.end}` || dbVal.replace(/\s/g, "") === `${s.start}–${s.end}`.replace(/\s/g, "");
  });
  const maxJobsForSlot = slotConfig?.max_jobs ?? Infinity;
  const isSlotFull = totalSlotJobs >= maxJobsForSlot && maxJobsForSlot < Infinity;

  // Holiday block check for selected engineer
  useEffect(() => {
    if (!engineer || !date) { setHolidayBlock(null); return; }
    const checkBlock = async () => {
      const eng = engineers.find((e: any) => e.id === engineer);
      const { data } = await supabase
        .from("engineer_blocks")
        .select("id, block_date, end_date")
        .eq("engineer_id", engineer)
        .lte("block_date", date)
        .or(`end_date.gte.${date},end_date.is.null`);
      // For rows with null end_date, check if block_date matches exactly
      const match = (data || []).some((b: any) =>
        b.end_date ? b.block_date <= date && b.end_date >= date : b.block_date === date
      );
      setHolidayBlock(match && eng ? { engineerName: eng.name } : null);
    };
    checkBlock();
  }, [engineer, date, engineers]);

  const isOnLeave = !!holidayBlock;

  const handleNext = () => {
    const e: typeof errors = {};
    if (!date) e.date = true;
    if (!block) e.block = true;
    if (!engineer) e.engineer = true;
    setErrors(e);
    if (Object.keys(e).length > 0 || isOnLeave || isSlotFull) return;
    onNext({ date, timeBlock: block, engineerId: engineer });
  };

  const loadColor = (n: number) => n >= 2 ? "text-destructive" : n >= 1 ? "text-warning" : "text-success";
  const loadBg = (n: number) => n >= 2 ? "bg-destructive/10 border-destructive/30" : n >= 1 ? "bg-warning/10 border-warning/30" : "bg-success/10 border-success/30";
  const loadLabel = (n: number) => n >= 2 ? "Full" : n >= 1 ? "Busy" : "Free";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date</Label>
          <Input type="date" value={date} min={todayISO} onChange={(e) => { setDate(e.target.value); setErrors((prev) => ({ ...prev, date: false })); }} className={`mt-1 ${validationBorderClass(!!errors.date)}`} />
          <ValidationMessage show={!!errors.date} />
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Time Block</Label>
          <div className={`flex gap-2.5 mt-1.5 rounded-xl ${errors.block ? "ring-2 ring-[#F59E0B] p-1" : ""}`}>
            {TIME_BLOCKS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setBlock(t.id); setErrors((prev) => ({ ...prev, block: false })); }}
                className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  block === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <t.Icon className={`w-5 h-5 ${block === t.id ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[13px] ${block === t.id ? "font-extrabold text-primary" : "font-semibold"}`}>{t.label}</span>
              </button>
            ))}
          </div>
          <ValidationMessage show={!!errors.block} />
          {isSlotFull && (
            <div className="mt-2 bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <span className="text-[13px] font-semibold text-warning">
                ⚠️ The {TIME_BLOCKS.find((t) => t.id === block)?.label || block} slot is fully booked for this date. Please select a different time.
              </span>
            </div>
          )}
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assign Engineer</Label>
          <div className={`space-y-2 mt-1.5 rounded-xl ${errors.engineer ? "ring-2 ring-[#F59E0B] p-1" : ""}`}>
            {engineers.map((eng: any) => {
              const load = (slotCounts as any)[eng.id] || 0;
              const isSelected = engineer === eng.id;
              const isFull = load >= 3;
              return (
                <button
                  key={eng.id}
                  onClick={() => { if (!isFull) { setEngineer(eng.id); setErrors((prev) => ({ ...prev, engineer: false })); } }}
                  className={`w-full p-3.5 rounded-xl border-2 flex items-center gap-3 transition-all ${
                    isSelected ? "border-primary bg-primary/5" : isFull ? "border-border opacity-50 cursor-not-allowed" : "border-border hover:border-primary/30 cursor-pointer"
                  }`}
                  disabled={isFull}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}>
                    {eng.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className={`text-sm ${isSelected ? "font-extrabold text-primary" : "font-semibold"}`}>{eng.name}</div>
                    <div className="text-[11px] text-muted-foreground">{load} job{load !== 1 ? "s" : ""} in this slot</div>
                  </div>
                  <div className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${loadBg(load)} ${loadColor(load)}`}>
                    {loadLabel(load)}
                  </div>
                </button>
              );
            })}
          </div>
          <ValidationMessage show={!!errors.engineer} />

          {isOnLeave && (
            <div className="mt-2 bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <span className="text-[13px] font-semibold text-warning">
                ⚠️ {holidayBlock!.engineerName} is on leave on this date and cannot be assigned.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pt-4 pb-2 border-t border-border flex gap-2.5">
        <Button variant="outline" onClick={onBack} className="font-bold">← Back</Button>
        <Button className="flex-1 h-12 font-extrabold text-base" disabled={isOnLeave} onClick={handleNext}>
          Set payment →
        </Button>
      </div>
    </div>
  );
};

/* ── STEP 4: Payment ───────────────────────────────────── */
const StepPayment = ({ jobData, engineers, onSubmit, onBack }: {
  jobData: any; engineers: any[]; onSubmit: (data: any) => void; onBack: () => void;
}) => {
  const jt = JOB_TYPES.find((j) => j.id === jobData.job.jobType) || JOB_TYPES[0];
  const suggestedPrice = jt.price;
  const [amount, setAmount] = useState(String(suggestedPrice || ""));
  const [payment, setPayment] = useState("unpaid");
  const [sendWA, setSendWA] = useState(true);

  const eng = engineers.find((e: any) => e.id === jobData.schedule.engineerId);
  const tb = TIME_BLOCKS.find((t) => t.id === jobData.schedule.timeBlock);
  const dateStr = (() => { try { return format(new Date(jobData.schedule.date + "T00:00:00"), "EEE d MMM"); } catch { return jobData.schedule.date; } })();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {/* Summary */}
        <div className="bg-muted/50 rounded-2xl border border-border p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5 flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Job Summary</div>
          {[
            { l: "Customer", v: jobData.customer.name },
            { l: "Address", v: jobData.customer.address },
            { l: "Job", v: jt.label },
            { l: "Date", v: dateStr },
            { l: "Time", v: tb?.label || "" },
            { l: "Engineer", v: eng?.name || "—" },
          ].map((item) => (
            <div key={item.l} className="flex justify-between text-[13px] py-1">
              <span className="text-muted-foreground font-semibold">{item.l}</span>
              <span className="font-bold text-right max-w-[60%]">{item.v}</span>
            </div>
          ))}
        </div>

        {/* Amount */}
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Job Amount €</Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">€</span>
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="pl-8" />
          </div>
          {suggestedPrice > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Suggested for {jt.label}: €{suggestedPrice}
              <button onClick={() => setAmount(String(suggestedPrice))} className="text-primary font-bold ml-1.5 hover:underline">Use this</button>
            </p>
          )}
        </div>

        {/* Payment status */}
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment Status</Label>
          <div className="flex gap-2 mt-1.5">
            {PAYMENT_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPayment(p.id)}
                className={`flex-1 p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  payment === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <p.Icon className={`w-5 h-5 ${payment === p.id ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[11px] text-center leading-tight ${payment === p.id ? "font-extrabold text-primary" : "font-semibold"}`}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* WhatsApp toggle */}
        <div className={`rounded-xl border p-4 flex justify-between items-center transition-colors ${sendWA ? "border-success/40" : "border-border"}`}>
          <div>
            <div className="text-sm font-bold flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-success" /> Send booking confirmation?</div>
            <div className="text-xs text-muted-foreground mt-1">WhatsApp to {jobData.customer.name?.split(" ")[0]} with date & engineer</div>
          </div>
          <Switch checked={sendWA} onCheckedChange={setSendWA} />
        </div>
      </div>

      <div className="px-5 pt-4 pb-2 border-t border-border flex gap-2.5">
        <Button variant="outline" onClick={onBack} className="font-bold">← Back</Button>
        <Button
          className="flex-1 h-12 font-extrabold text-base bg-success hover:bg-success/90 text-success-foreground gap-2"
          onClick={() => onSubmit({ ...jobData, payment: { amount: parseFloat(amount) || 0, status: payment }, sendWhatsApp: sendWA })}
        >
          <CheckCircle2 className="w-5 h-5" /> Create Job
        </Button>
      </div>
    </div>
  );
};

/* ── SUCCESS SCREEN ────────────────────────────────────── */
const SuccessScreen = ({ jobData, engineers, onClose, onNewJob }: {
  jobData: any; engineers: any[]; onClose: () => void; onNewJob: () => void;
}) => {
  const navigate = useNavigate();
  const eng = engineers.find((e: any) => e.id === jobData.schedule?.engineerId);
  const tb = TIME_BLOCKS.find((t) => t.id === jobData.schedule?.timeBlock);
  const jt = JOB_TYPES.find((j) => j.id === jobData.job?.jobType);
  const dateStr = (() => { try { return format(new Date(jobData.schedule.date + "T00:00:00"), "EEEE d MMMM"); } catch { return ""; } })();

  const waMsg = `Hi ${jobData.customer?.name?.split(" ")[0]}! Your ${jt?.label?.toLowerCase() || "job"} is booked.\n\nDate: ${dateStr}\nTime: ${tb?.label}\nEngineer: ${eng?.name}\n\nWe'll be in touch if anything changes!`;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 text-center">
      <div className="w-[72px] h-[72px] rounded-2xl bg-success/10 flex items-center justify-center mb-4 shadow-lg"><CheckCircle2 className="w-9 h-9 text-success" /></div>
      <h2 className="text-xl font-extrabold mb-1.5">Job Created!</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-5">
        {jobData.customer?.name} · {jt?.label}<br />
        {dateStr} · {tb?.label}<br />
        Assigned to {eng?.name || "—"}
      </p>

      <div className="bg-muted/50 rounded-2xl border border-border p-4 w-full mb-5 text-left">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">What happens now</div>
        {[
          { Icon: CalendarDays, text: "Job appears in the schedule grid immediately" },
          { Icon: HardHat, text: `${eng?.name || "Engineer"} sees it on their app` },
          ...(jobData.sendWhatsApp ? [{ Icon: MessageCircle, text: "Booking confirmation ready to send" }] : []),
          { Icon: Bell, text: "Audit log updated" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 mb-2 last:mb-0">
            <item.Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-[13px] text-muted-foreground">{item.text}</span>
          </div>
        ))}
      </div>

      {jobData.sendWhatsApp && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-3 w-full mb-5 text-left">
          <div className="text-[10px] font-bold uppercase tracking-wider text-success mb-1.5 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp preview</div>
          <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{waMsg}</pre>
          <Button
            className="w-full mt-3 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold gap-2"
            onClick={() => window.open(`https://wa.me/${jobData.customer?.phone?.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMsg)}`, "_blank")}
          >
            <MessageCircle className="w-4 h-4" /> Open WhatsApp to send
          </Button>
        </div>
      )}

      <div className="flex gap-2.5 w-full">
        <Button variant="outline" className="flex-1 font-bold" onClick={onNewJob}>+ Another Job</Button>
        <Button className="flex-1 font-bold" onClick={() => { onClose(); navigate("/schedule"); }}>View Schedule →</Button>
      </div>
    </div>
  );
};

/* ── MAIN PANEL ────────────────────────────────────────── */
const NewJobPanel = ({ onClose, prefilledCustomer, prefilledDate, prefilledBlock, prefilledEngineer, prefilledJobType }: NewJobPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(prefilledCustomer ? 1 : 0);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const [jobData, setJobData] = useState<any>({
    customer: prefilledCustomer || null,
    job: null,
    schedule: null,
    payment: null,
    sendWhatsApp: true,
  });

  const isDirty = !!(jobData.customer || jobData.job || jobData.schedule);

  const { data: engineers = [] } = useQuery({
    queryKey: ["engineers-for-new-job"],
    queryFn: async () => {
      const { data } = await supabase.from("engineers").select("id, name, status").eq("status", "active");
      return data || [];
    },
  });

  const handleCustomer = (c: any) => { setJobData((d: any) => ({ ...d, customer: c })); setStep(1); };
  const handleJob = (j: any) => { setJobData((d: any) => ({ ...d, job: j })); setStep(2); };
  const handleSchedule = (s: any) => { setJobData((d: any) => ({ ...d, schedule: s })); setStep(3); };

  const handleClose = () => {
    if (isDirty && !done) {
      setShowLeaveGuard(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (finalData: any) => {
    if (!user) return;
    setSaving(true);

    try {
      let customerId = finalData.customer?.id;
      const isNewCustomer = finalData.customer?.isNew || customerId === "NEW";

      console.log("[NewJobPanel] Submit start", { customerId, isNewCustomer, customer: finalData.customer?.name });

      // Create new customer if needed
      if (isNewCustomer) {
        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          user_id: user.id,
          name: finalData.customer.name,
          phone: finalData.customer.phone,
          address: finalData.customer.address,
          eircode: finalData.customer.eircode || "",
          boiler_make_model: finalData.customer.boilerType || null,
        }).select("id").single();
        if (custErr) {
          console.error("[NewJobPanel] Customer insert error:", custErr);
          throw custErr;
        }
        customerId = newCust.id;
        console.log("[NewJobPanel] New customer created:", customerId);
      }

      if (!customerId || customerId === "NEW") {
        throw new Error("No valid customer ID — cannot create job");
      }

      const eng = engineers.find((e: any) => e.id === finalData.schedule.engineerId);
      const depositPaid = finalData.payment.status === "paid" || finalData.payment.status === "deposit";

      console.log("[NewJobPanel] Inserting service_call", { customerId, jobType: finalData.job.jobType, date: finalData.schedule.date, engineer: eng?.name });

      const { data: newJob, error: jobErr } = await supabase.from("service_calls").insert({
        user_id: user.id,
        customer_id: customerId,
        job_type: finalData.job.jobType,
        boiler_brand: finalData.job.boilerModel || null,
        boiler_issue: finalData.job.notes || null,
        notes: finalData.job.notes || null,
        scheduled_date: finalData.schedule.date,
        time_block: TIME_BLOCKS.find(t => t.id === finalData.schedule.timeBlock)?.dbValue || finalData.schedule.timeBlock,
        assigned_engineer_id: finalData.schedule.engineerId,
        assigned_engineer: eng?.name || null,
        status: "Booked",
        revenue: finalData.payment.amount || null,
        deposit_paid: depositPaid,
        deposit_amount: finalData.payment.status === "deposit" ? finalData.payment.amount : null,
        source: "Manual",
        incoming_status: "Accepted",
      }).select("id").single();
      if (jobErr) {
        console.error("[NewJobPanel] Job insert error:", jobErr);
        throw jobErr;
      }
      console.log("[NewJobPanel] Job created successfully:", newJob?.id);

      await logAudit({
        action_type: "job_created",
        entity_type: "service_call",
        entity_id: customerId,
        detail: `New ${finalData.job.jobType} for ${finalData.customer.name} on ${finalData.schedule.date}`,
      });

      setJobData(finalData);
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["schedule-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Job created ✔", description: `${finalData.customer.name} · ${finalData.job.jobType}` });
    } catch (err: any) {
      toast({ title: "Error creating job", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNewJob = () => {
    setStep(0);
    setDone(false);
    setJobData({ customer: null, job: null, schedule: null, payment: null, sendWhatsApp: true });
  };

  const STEP_TITLES = ["Customer", "Job Details", "Schedule", "Payment"];

  return (
    <>
    <Sheet open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent className="w-full sm:max-w-[480px] p-0 flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 pt-5 pb-0">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-xl font-extrabold">
              {done ? <><PartyPopper className="w-5 h-5 inline mr-1" /> Job Created</> : "New Job"}
            </SheetTitle>
            {!done && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Step {step + 1} of 4 — {STEP_TITLES[step]}
              </p>
            )}
          </SheetHeader>
          {!done && <StepBar step={step} />}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden pt-4">
          {saving ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : done ? (
            <SuccessScreen jobData={jobData} engineers={engineers} onClose={onClose} onNewJob={handleNewJob} />
          ) : step === 0 ? (
            <StepCustomer prefilledCustomer={prefilledCustomer} onNext={handleCustomer} />
          ) : step === 1 ? (
            <StepJob prefilledType={prefilledJobType} prefilledBoiler={jobData.customer?.boiler_make_model || jobData.customer?.boilerType || ""} onNext={handleJob} onBack={() => setStep(0)} />
          ) : step === 2 ? (
            <StepSchedule prefilledDate={prefilledDate} prefilledBlock={prefilledBlock} prefilledEngineer={prefilledEngineer} onNext={handleSchedule} onBack={() => setStep(1)} />
          ) : (
            <StepPayment jobData={jobData} engineers={engineers} onSubmit={handleSubmit} onBack={() => setStep(2)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
    <FormLeaveGuard
      open={showLeaveGuard}
      onKeepEditing={() => setShowLeaveGuard(false)}
      onLeave={() => { setShowLeaveGuard(false); onClose(); }}
    />
    </>
  );
};

export default NewJobPanel;
