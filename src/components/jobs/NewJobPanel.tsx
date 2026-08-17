import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isValidGprnFormat, GPRN_WARNING_MESSAGE } from "@/lib/validation/gprn";
import { calcDepositAmount } from "@/lib/depositCalc";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, ChevronLeft, ChevronDown, Loader2, Check, Plus, Phone, MapPin, Flame, Wrench, AlertTriangle, Settings, Sunrise, Sun, CloudSun, FileText, CreditCard, CheckCircle2, MessageCircle, CalendarDays, HardHat, Bell, ClipboardList, PartyPopper, XCircle } from "lucide-react";
import { format, parse } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { validationBorderClass, ValidationMessage } from "@/components/shared/FormValidation";
import FormLeaveGuard from "@/components/shared/FormLeaveGuard";
import { classifySendResult, type SendResult } from "@/lib/sendResult";
import {
  validateRequired, validatePhone, validateEircode,
  formatEircode, formatPhoneInternational, RED_BORDER, type CustomerFieldErrors,
} from "@/lib/customerValidation";

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
  { id: "Boiler Service", label: "Boiler Service", Icon: Flame },
  { id: "Repair", label: "Repair", Icon: Wrench },
  { id: "Emergency", label: "Emergency", Icon: AlertTriangle },
  { id: "Installation", label: "Installation", Icon: Settings },
];

const DEFAULT_TIME_BLOCKS = [
  { id: "9–11", label: "9–11am", Icon: Sunrise, dbValue: "9am–11am", startHour: 9, endHour: 11 },
  { id: "11–2", label: "11am–2pm", Icon: Sun, dbValue: "11am–1pm", startHour: 11, endHour: 14 },
  { id: "2–5", label: "2–5pm", Icon: CloudSun, dbValue: "2pm–5pm", startHour: 14, endHour: 17 },
];

const SLOT_ICONS = [Sunrise, Sun, CloudSun];

const formatTimeLabel = (start: string, end: string) => {
  const fmtHour = (t: string) => {
    const h = parseInt(t.split(":")[0], 10);
    const suffix = h >= 12 ? "pm" : "am";
    const display = h > 12 ? h - 12 : h;
    return `${display}${suffix}`;
  };
  return `${fmtHour(start)}–${fmtHour(end)}`;
};

const buildTimeBlocks = (slotMaxJobs: any[]) => {
  if (!slotMaxJobs || slotMaxJobs.length === 0) return DEFAULT_TIME_BLOCKS;
  return slotMaxJobs.map((s: any, i: number) => {
    const startH = parseInt(s.start?.split(":")[0] || "9", 10);
    const startM = parseInt(s.start?.split(":")[1] || "0", 10);
    const endH = parseInt(s.end?.split(":")[0] || "17", 10);
    const endM = parseInt(s.end?.split(":")[1] || "0", 10);
    const label = formatTimeLabel(s.start || "09:00", s.end || "17:00");
    const id = `${startH}–${endH}`;
    return {
      id,
      label,
      Icon: SLOT_ICONS[i % SLOT_ICONS.length],
      dbValue: label,
      startHour: startH + startM / 60,
      endHour: endH + endM / 60,
    };
  });
};

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
  const { orgId } = useOrgId();
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
  const [errors, setErrors] = useState<CustomerFieldErrors>({});
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [dupeCheckError, setDupeCheckError] = useState<string | null>(null);
  const [checkingDupe, setCheckingDupe] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ["customer-search", search],
    queryFn: async () => {
      if (!search.trim() || search.length < 2) return [];
      const q = `%${search}%`;
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, eircode, area_code, boiler_make_model, boiler_type, under_warranty, owner_or_tenant, boiler_brand, boiler_model, access_notes, gprn, boiler_location")
        .or(`name.ilike.${q},phone.ilike.${q},eircode.ilike.${q},address.ilike.${q}`)
        .limit(5);
      return data || [];
    },
    enabled: !selected && !isNew && search.length >= 2,
  });

  const clearError = (field: string) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  const blurName = () => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (trimmed !== name) setName(trimmed);
    const err = validateRequired(trimmed);
    setErrors((e) => ({ ...e, name: err || "" }));
  };

  const blurAddress = () => {
    const err = validateRequired(address);
    setErrors((e) => ({ ...e, address: err || "" }));
  };

  // formatPhoneInternational never throws and never rejects input — it blindly
  // prepends +353, so validatePhone must gate it. Validate first, format after.
  const blurPhone = () => {
    const err = validatePhone(phone);
    if (err) {
      setErrors((e) => ({ ...e, phone: err }));
      return;
    }
    setErrors((e) => ({ ...e, phone: "" }));
    setPhone(formatPhoneInternational(phone));
    setDuplicate(null);
    setDupeCheckError(null);
  };

  const blurEircode = () => {
    if (!eircode.trim()) { setErrors((e) => ({ ...e, eircode: "" })); return; }
    const err = validateEircode(eircode);
    if (err) {
      setErrors((e) => ({ ...e, eircode: err }));
      return;
    }
    setErrors((e) => ({ ...e, eircode: "" }));
    setEircode(formatEircode(eircode));
  };

  const phoneValid = isNew ? validatePhone(phone) === null : true;

  const canProceed = Boolean(
    selected
      ? true
      : isNew && name.trim() && phoneValid && address.trim() && !duplicate && !checkingDupe
  );

  const handleNext = async () => {
    if (!isNew) { onNext(selected); return; }

    const cleanName = name.replace(/\s+/g, " ").trim();
    const nextErrors: CustomerFieldErrors = {};
    const nameErr = validateRequired(cleanName); if (nameErr) nextErrors.name = nameErr;
    const phoneErr = validatePhone(phone); if (phoneErr) nextErrors.phone = phoneErr;
    const addressErr = validateRequired(address); if (addressErr) nextErrors.address = addressErr;
    if (eircode.trim()) {
      const eircodeErr = validateEircode(eircode); if (eircodeErr) nextErrors.eircode = eircodeErr;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const cleanPhone = formatPhoneInternational(phone);
    const cleanEircode = eircode.trim() ? formatEircode(eircode) : "";

    // Fail-safe duplicate check: any error blocks progression.
    setCheckingDupe(true);
    setDupeCheckError(null);
    setDuplicate(null);
    const { data: dupe, error: dupeErr } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", cleanPhone)
      .eq("organisation_id", orgId!)
      .maybeSingle();
    setCheckingDupe(false);

    if (dupeErr) {
      setDupeCheckError("Couldn't check for duplicates — try again");
      return;
    }
    if (dupe) {
      setDuplicate({ id: dupe.id, name: dupe.name });
      return;
    }

    setName(cleanName);
    setPhone(cleanPhone);
    if (cleanEircode) setEircode(cleanEircode);
    onNext({ id: "NEW", name: cleanName, phone: cleanPhone, address: address.trim(), eircode: cleanEircode, boilerType: boiler, isNew: true });
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
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); clearError("name"); }}
                onBlur={blurName}
                placeholder="e.g. Niamh Lawlor"
                maxLength={100}
                className={cn("mt-1", errors.name && RED_BORDER)}
              />
              {errors.name && <p className="text-xs mt-1 font-medium text-destructive">{errors.name}</p>}
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mobile Number <span className="text-destructive">*</span></Label>
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); clearError("phone"); setDuplicate(null); setDupeCheckError(null); }}
                onBlur={blurPhone}
                placeholder="083 123 4567"
                maxLength={30}
                className={cn("mt-1", errors.phone && RED_BORDER)}
              />
              {errors.phone && <p className="text-xs mt-1 font-medium text-destructive">{errors.phone}</p>}
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Address <span className="text-destructive">*</span></Label>
              <Input
                value={address}
                onChange={(e) => { setAddress(e.target.value); clearError("address"); }}
                onBlur={blurAddress}
                placeholder="12 Green Park, Dublin 15"
                maxLength={200}
                className={cn("mt-1", errors.address && RED_BORDER)}
              />
              {errors.address && <p className="text-xs mt-1 font-medium text-destructive">{errors.address}</p>}
            </div>
            {duplicate && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-warning flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>"{duplicate.name}" already has this phone number. Search for them above instead of creating a duplicate.</span>
              </div>
            )}
            {dupeCheckError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{dupeCheckError}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Eircode</Label>
                <Input
                  value={eircode}
                  onChange={(e) => { setEircode(e.target.value.toUpperCase()); clearError("eircode"); }}
                  onBlur={blurEircode}
                  placeholder="D15 A1B2"
                  maxLength={10}
                  className={cn("mt-1", errors.eircode && RED_BORDER)}
                />
                {errors.eircode && <p className="text-xs mt-1 font-medium text-destructive">{errors.eircode}</p>}
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
        <Button className="w-full h-12 font-extrabold text-base" disabled={!canProceed || checkingDupe} onClick={handleNext}>
          {checkingDupe ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking…</>
          ) : canProceed ? `Continue with ${selected?.name || name} →` : "Select or add a customer"}
        </Button>
      </div>
    </div>
  );
};

/* ── STEP 2: Job Details ───────────────────────────────── */
const StepJob = ({ prefilledType, prefilledBoiler, prefilledCustomer, onNext, onBack }: { prefilledType?: string; prefilledBoiler?: string; prefilledCustomer?: any; onNext: (j: any) => void; onBack: () => void }) => {
  const { user } = useAuth();
  const [jobType, setJobType] = useState(prefilledType || "Boiler Service");
  const [notes, setNotes] = useState("");
  const [boilerBrand, setBoilerBrand] = useState(prefilledCustomer?.boiler_brand || prefilledBoiler || "");
  const [boilerBrandQuery, setBoilerBrandQuery] = useState(prefilledCustomer?.boiler_brand || prefilledBoiler || "");
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [boilerModel, setBoilerModel] = useState(prefilledCustomer?.boiler_model || "");
  const [boilerModelQuery, setBoilerModelQuery] = useState(prefilledCustomer?.boiler_model || "");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [jobTypeError, setJobTypeError] = useState(false);
  const [email, setEmail] = useState(prefilledCustomer?.email || "");
  const [jobIssue, setJobIssue] = useState("");
  const [extraDetails, setExtraDetails] = useState("");
  const [boilerType, setBoilerType] = useState(prefilledCustomer?.boiler_type || "");
  const [boilerErrorCode, setBoilerErrorCode] = useState("");
  const [areaCode, setAreaCode] = useState(prefilledCustomer?.area_code || "");
  const [ownerOrTenant, setOwnerOrTenant] = useState(prefilledCustomer?.owner_or_tenant || "");
  const [accessNotes, setAccessNotes] = useState(prefilledCustomer?.access_notes || "");
  const [gprn, setGprn] = useState(prefilledCustomer?.gprn || "");
  const [boilerLocation, setBoilerLocation] = useState(prefilledCustomer?.boiler_location || "");
  const isUrgent = jobType === "Emergency";

  const { data: brandSuggestions = [] } = useQuery({
    queryKey: ["boiler-brand-suggestions", boilerBrandQuery],
    queryFn: async () => {
      const q = boilerBrandQuery.trim();
      const query = supabase.from("boiler_brands").select("brand_name").eq("is_default", true).order("brand_name").limit(8);
      if (q) query.ilike("brand_name", `%${q}%`);
      const { data } = await query;
      return [...new Set((data || []).map((r: any) => r.brand_name))];
    },
    enabled: brandDropdownOpen,
  });

  const { data: modelSuggestions = [] } = useQuery({
    queryKey: ["boiler-model-suggestions", boilerBrand, boilerModelQuery],
    queryFn: async () => {
      if (!boilerBrand.trim()) return [];
      const q = boilerModelQuery.trim();
      const query = supabase.from("boiler_brands").select("model_name").eq("is_default", false).eq("brand_name", boilerBrand.trim()).order("model_name").limit(8);
      if (q) query.ilike("model_name", `%${q}%`);
      const { data } = await query;
      return [...new Set((data || []).filter((r: any) => r.model_name).map((r: any) => r.model_name))];
    },
    enabled: boilerBrand.trim().length > 0 && modelDropdownOpen,
  });

  const { data: defaultPrices } = useQuery({
    queryKey: ["default-job-prices", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("default_service_price, default_emergency_price, default_repair_price, default_callout_charge")
        .eq("user_id", user!.id)
        .maybeSingle();
      return {
        service: Number(data?.default_service_price ?? 120),
        emergency: Number(data?.default_emergency_price ?? 150),
        repair: Number(data?.default_repair_price ?? 0),
        callout: Number(data?.default_callout_charge ?? 85),
      };
    },
    enabled: !!user,
  });

  const getJobPrice = (typeId: string) => {
    if (!defaultPrices) return null;
    if (typeId === "Emergency") return defaultPrices.emergency;
    if (typeId === "Boiler Service") return defaultPrices.service;
    if (typeId === "Repair") return defaultPrices.repair;
    return null;
  };

  const handleNext = () => {
    if (!jobType) {
      setJobTypeError(true);
      return;
    }
    const combinedMakeModel = [boilerBrand.trim(), boilerModel.trim()].filter(Boolean).join(" ") || "";
    onNext({ jobType, isUrgent, notes, boilerModel: combinedMakeModel, boilerBrand: boilerBrand.trim(), boilerModelField: boilerModel.trim(), email, jobIssue, extraDetails, boilerType, boilerErrorCode, areaCode, ownerOrTenant, accessNotes, gprn: gprn.trim(), boilerLocation: boilerLocation.trim() });
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
                {(() => { const p = getJobPrice(j.id); return p && p > 0 ? <span className="text-[11px] text-muted-foreground">€{p}</span> : null; })()}
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

        {/* Boiler Brand — typeahead */}
        <div className="relative">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Brand</Label>
          <div className="relative mt-1">
            <Input
              value={boilerBrand}
              onChange={(e) => {
                setBoilerBrand(e.target.value);
                setBoilerBrandQuery(e.target.value);
                if (!brandDropdownOpen) setBrandDropdownOpen(true);
                if (e.target.value !== boilerBrand) { setBoilerModel(""); setBoilerModelQuery(""); }
              }}
              onFocus={() => { setBrandDropdownOpen(true); setBoilerBrandQuery(boilerBrand); }}
              onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 200)}
              placeholder="e.g. Vaillant, Ideal, Worcester"
              className="pr-9"
              autoComplete="off"
            />
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setBrandDropdownOpen(!brandDropdownOpen)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${brandDropdownOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {brandDropdownOpen && brandSuggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {brandSuggestions.map((b: string) => (
                <button key={b} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBoilerBrand(b); setBoilerBrandQuery(b); setBrandDropdownOpen(false); setBoilerModel(""); setBoilerModelQuery(""); }} className="w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors">{b}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">Start typing or click to see options</p>
        </div>

        {/* Boiler Model — typeahead when brand selected, otherwise free-text */}
        <div className="relative">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Model</Label>
          <div className="relative mt-1">
            <Input
              value={boilerModel}
              onChange={(e) => {
                setBoilerModel(e.target.value);
                setBoilerModelQuery(e.target.value);
                if (!modelDropdownOpen && boilerBrand.trim()) setModelDropdownOpen(true);
              }}
              onFocus={() => { if (boilerBrand.trim()) { setModelDropdownOpen(true); setBoilerModelQuery(boilerModel); } }}
              onBlur={() => setTimeout(() => setModelDropdownOpen(false), 200)}
              placeholder="e.g. Logic Heat 18"
              className="pr-9"
              autoComplete="off"
            />
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (boilerBrand.trim()) setModelDropdownOpen(!modelDropdownOpen); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-4 h-4 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {modelDropdownOpen && modelSuggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {modelSuggestions.map((m: string) => (
                <button key={m} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBoilerModel(m); setBoilerModelQuery(m); setModelDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors">{m}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">Start typing or click to see options</p>
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. john@example.com" className="mt-1" />
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Job Issue</Label>
          <Input value={jobIssue} onChange={(e) => setJobIssue(e.target.value)} placeholder="e.g. Boiler not heating water" className="mt-1" />
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Extra Details on Issue</Label>
          <Textarea rows={3} value={extraDetails} onChange={(e) => setExtraDetails(e.target.value)} placeholder="Any additional details about the issue…" className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Type</Label>
            <Input value={boilerType} onChange={(e) => setBoilerType(e.target.value)} placeholder="e.g. Combi" className="mt-1" />
          </div>
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Error Code</Label>
            <Input value={boilerErrorCode} onChange={(e) => setBoilerErrorCode(e.target.value)} placeholder="e.g. F28" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">GPRN</Label>
            <Input value={gprn} onChange={(e) => setGprn(e.target.value)} placeholder="e.g. 1234567" className="mt-1" />
            {gprn.trim() && !isValidGprnFormat(gprn) && (
              <p className="text-[11px] text-amber-600 mt-1">{GPRN_WARNING_MESSAGE}</p>
            )}
          </div>
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Boiler Location</Label>
            <Input value={boilerLocation} onChange={(e) => setBoilerLocation(e.target.value)} placeholder="e.g. kitchen, attic, utility room" className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Area</Label>
            <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="e.g. Kilmainham, Dublin 8" className="mt-1" />
          </div>
          <div>
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Owner or Tenant</Label>
            <select
              value={ownerOrTenant}
              onChange={(e) => setOwnerOrTenant(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
            >
              <option value="">Select…</option>
              <option value="Owner">Owner</option>
              <option value="Tenant">Tenant</option>
            </select>
          </div>
        </div>

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Access Notes</Label>
          <Textarea rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} placeholder="e.g. Key under the mat, ring doorbell twice…" className="mt-1" />
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

  // Fetch all holiday blocks for the selected date across all engineers
  const { data: engineerBlocksOnDate = [] } = useQuery({
    queryKey: ["engineer-blocks-on-date", date],
    queryFn: async () => {
      const { data } = await supabase
        .from("engineer_blocks")
        .select("id, engineer_id, block_date, end_date")
        .lte("block_date", date)
        .or(`end_date.gte.${date},end_date.is.null`);
      return (data || []).filter((b: any) =>
        b.end_date ? b.block_date <= date && b.end_date >= date : b.block_date === date
      );
    },
    enabled: !!date,
  });

  const engineersOnLeaveSet = new Set(
    (engineerBlocksOnDate as any[]).map((b: any) => b.engineer_id)
  );

  // Total slot capacity check from settings.job_time_blocks + opening_hours
  const { data: settingsData } = useQuery({
    queryKey: ["slot-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("job_time_blocks, opening_hours").limit(1).single();
      return {
        slotMaxJobs: (data?.job_time_blocks as any[] | null) || [],
        openingHours: (data?.opening_hours as any[] | null) || [],
      };
    },
  });

  const slotMaxJobs = settingsData?.slotMaxJobs || [];
  const openingHours = settingsData?.openingHours || [];

  const TIME_BLOCKS = useMemo(() => buildTimeBlocks(slotMaxJobs), [slotMaxJobs]);
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

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const availableTimeBlocks = useMemo(() => {
    if (!date || openingHours.length === 0) return TIME_BLOCKS;
    const selectedDay = new Date(date + "T12:00:00");
    const dayLabel = DAY_LABELS[selectedDay.getDay()];
    const dayConfig = openingHours.find((h: any) => h.day === dayLabel);
    if (!dayConfig || !dayConfig.enabled) return [];

    const closeHour = parseInt(dayConfig.end?.split(":")[0] || "17", 10);
    const closeMin = parseInt(dayConfig.end?.split(":")[1] || "0", 10);
    const closeDecimal = closeHour + closeMin / 60;
    const openHour = parseInt(dayConfig.start?.split(":")[0] || "9", 10);
    const openMin = parseInt(dayConfig.start?.split(":")[1] || "0", 10);
    const openDecimal = openHour + openMin / 60;

    return TIME_BLOCKS.filter((t) => {
      return t.startHour >= openDecimal && t.startHour < closeDecimal;
    });
  }, [date, openingHours]);

  // Reset block selection if current block is no longer available
  useEffect(() => {
    if (block && availableTimeBlocks.length > 0 && !availableTimeBlocks.find(t => t.id === block)) {
      setBlock(availableTimeBlocks[0].id);
    } else if (availableTimeBlocks.length === 0) {
      setBlock("");
    }
  }, [availableTimeBlocks]);

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

  // Holiday block check for selected engineer (uses pre-fetched data)
  useEffect(() => {
    if (!engineer || !date) { setHolidayBlock(null); return; }
    const eng = engineers.find((e: any) => e.id === engineer);
    if (engineersOnLeaveSet.has(engineer) && eng) {
      setHolidayBlock({ engineerName: eng.name });
    } else {
      setHolidayBlock(null);
    }
  }, [engineer, date, engineers, engineersOnLeaveSet.size]);

  const isOnLeave = !!holidayBlock;

  const handleNext = () => {
    const e: typeof errors = {};
    if (!date) e.date = true;
    if (!block) e.block = true;
    if (!engineer) e.engineer = true;
    setErrors(e);
    if (Object.keys(e).length > 0 || isOnLeave || isSlotFull || (date && date < todayISO)) return;
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full mt-1 justify-start text-left font-normal",
                  !date && "text-muted-foreground",
                  validationBorderClass(!!errors.date)
                )}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {date ? format(new Date(date + "T00:00:00"), "dd/MM/yyyy") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date ? new Date(date + "T00:00:00") : undefined}
                onSelect={(d) => {
                  if (d) {
                    setDate(format(d, "yyyy-MM-dd"));
                    setErrors((prev) => ({ ...prev, date: false }));
                  }
                }}
                disabled={(d) => d < new Date(todayISO + "T00:00:00")}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <ValidationMessage show={!!errors.date} />
          {date && date < todayISO && (
            <div className="mt-2 bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2.5">
              <CalendarDays className="w-5 h-5 text-warning shrink-0" />
              <span className="text-[13px] font-semibold text-warning">
                Please select a future date — this date has already passed.
              </span>
            </div>
          )}
          {date && date >= todayISO && availableTimeBlocks.length === 0 && (
            <div className="mt-2 bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2.5">
              <CalendarDays className="w-5 h-5 text-warning shrink-0" />
              <span className="text-[13px] font-semibold text-warning">
                This day is not available for bookings. Please select a different date.
              </span>
            </div>
          )}
        </div>

        {availableTimeBlocks.length > 0 && (!date || date >= todayISO) && (
        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Time Block</Label>
          <div className={`flex gap-2.5 mt-1.5 rounded-xl ${errors.block ? "ring-2 ring-[#F59E0B] p-1" : ""}`}>
            {availableTimeBlocks.map((t) => (
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
        )}

        <div>
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assign Engineer</Label>
          <div className={`space-y-2 mt-1.5 rounded-xl ${errors.engineer ? "ring-2 ring-[#F59E0B] p-1" : ""}`}>
            {engineers.map((eng: any) => {
              const load = (slotCounts as any)[eng.id] || 0;
              const isSelected = engineer === eng.id;
              const isFull = load >= 3;
              const onLeave = engineersOnLeaveSet.has(eng.id);
              return (
                <button
                  key={eng.id}
                  onClick={() => { if (!isFull && !onLeave) { setEngineer(eng.id); setErrors((prev) => ({ ...prev, engineer: false })); } }}
                  className={`w-full p-3.5 rounded-xl border-2 flex items-center gap-3 transition-all ${
                    isSelected ? "border-primary bg-primary/5" : (isFull || onLeave) ? "border-border opacity-50 cursor-not-allowed" : "border-border hover:border-primary/30 cursor-pointer"
                  }`}
                  disabled={isFull || onLeave}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${
                    isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}>
                    {eng.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className={`text-sm flex items-center gap-1.5 ${isSelected ? "font-extrabold text-primary" : "font-semibold"}`}>
                      {eng.name}
                      {onLeave && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
                          🏖️ On Leave
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {onLeave ? "Unavailable on this date" : `${load} job${load !== 1 ? "s" : ""} in this slot`}
                    </div>
                  </div>
                  {!onLeave && (
                    <div className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${loadBg(load)} ${loadColor(load)}`}>
                      {loadLabel(load)}
                    </div>
                  )}
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
        <Button className="flex-1 h-12 font-extrabold text-base" disabled={isOnLeave || isSlotFull || availableTimeBlocks.length === 0} onClick={handleNext}>
          Set payment →
        </Button>
      </div>
    </div>
  );
};

/* ── STEP 4: Payment ───────────────────────────────────── */
const StepPayment = ({ jobData, engineers, onSubmit, onBack, orgReady = true, orgId }: {
  jobData: any; engineers: any[]; onSubmit: (data: any) => void; onBack: () => void; orgReady?: boolean; orgId?: string | null;

}) => {
  const { user } = useAuth();
  const jt = JOB_TYPES.find((j) => j.id === jobData.job.jobType) || JOB_TYPES[0];

  // Fetch default prices from settings for current user
  const { data: defaultPrices } = useQuery({
    queryKey: ["default-job-prices", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("default_service_price, default_emergency_price, default_repair_price, default_callout_charge")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) console.error("[StepPayment] settings fetch error:", error);
      return {
        service: Number(data?.default_service_price ?? 120),
        emergency: Number(data?.default_emergency_price ?? 150),
        repair: Number(data?.default_repair_price ?? 0),
        callout: Number(data?.default_callout_charge ?? 85),
      };
    },
    enabled: !!user,
  });

  // Tenant deposit percentage — organisation-scoped, resolved on Step 4 mount
  const { data: depositSettings, isSuccess: depositSettingsLoaded } = useQuery({
    queryKey: ["deposit-percentage", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("deposit_percentage")
        .eq("organisation_id", orgId!)
        .maybeSingle();
      if (error) console.error("[StepPayment] deposit_percentage fetch error:", error);
      return { depositPercentage: data?.deposit_percentage ?? null };
    },
    enabled: !!orgId,
  });

  const getPrice = (jobType: string, prices: typeof defaultPrices) => {
    if (!prices) return 0;
    if (jobType === "Emergency") return prices.emergency;
    if (jobType === "Boiler Service") return prices.service;
    if (jobType === "Repair") return prices.repair;
    return 0;
  };

  const suggestedPrice = getPrice(jobData.job.jobType, defaultPrices);

  const [amount, setAmount] = useState(() => {
    // Try to compute initial value synchronously (won't have query data yet)
    return "";
  });
  const [priceInitialized, setPriceInitialized] = useState(false);
  const [payment, setPayment] = useState("unpaid");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositManuallySet, setDepositManuallySet] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [sendDepositLink, setSendDepositLink] = useState(true);
  const [sendWA, setSendWA] = useState(true);

  // Pre-fill amount once settings have loaded
  useEffect(() => {
    if (!priceInitialized && defaultPrices) {
      const price = getPrice(jobData.job.jobType, defaultPrices);
      setAmount(price > 0 ? String(price) : "");
      setPriceInitialized(true);
    }
  }, [defaultPrices, priceInitialized, jobData.job.jobType]);

  const amountNum = parseFloat(amount) || 0;
  const depositNum = parseFloat(depositAmount) || 0;

  // Pre-fill deposit as the tenant's configured % of the job amount, unless
  // the office user has manually edited the field. Waits for the settings
  // fetch so the calculation never runs against not-yet-loaded data.
  useEffect(() => {
    if (payment !== "deposit") return;
    if (depositManuallySet) return;
    if (!depositSettingsLoaded) return;
    setDepositAmount(calcDepositAmount(amountNum, depositSettings?.depositPercentage).toFixed(2));
  }, [payment, depositManuallySet, depositSettingsLoaded, depositSettings?.depositPercentage, amountNum]);

  // Fresh entry into deposit mode re-offers the calculated default
  const handlePaymentChange = (next: string) => {
    if (next !== payment && next !== "deposit") {
      setDepositManuallySet(false);
      setDepositError(null);
    }
    setPayment(next);
  };

  const handleCreateJob = () => {
    if (payment === "deposit" && depositNum > amountNum) {
      setDepositError("Deposit cannot exceed job amount");
      return;
    }
    setDepositError(null);
    onSubmit({
      ...jobData,
      payment: {
        amount: amountNum,
        status: payment,
        depositAmount: payment === "deposit" ? depositNum : null,
        balanceDue: payment === "deposit" ? Math.max(0, amountNum - depositNum) : null,
        sendDepositLink: payment === "deposit" ? sendDepositLink : false,
      },
      sendWhatsApp: sendWA,
    });
  };

  const eng = engineers.find((e: any) => e.id === jobData.schedule.engineerId);
  const tb = DEFAULT_TIME_BLOCKS.find((t) => t.id === jobData.schedule.timeBlock) || { label: jobData.schedule.timeBlock };
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
                onClick={() => handlePaymentChange(p.id)}
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

        {/* Deposit fields — only when "Deposit Taken" */}
        {payment === "deposit" && (
          <>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Deposit Amount €</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">€</span>
                <Input
                  type="number"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    setDepositManuallySet(true);
                    setDepositError(null);
                  }}
                  placeholder="0"
                  className={cn("pl-8", depositError && "border-destructive focus-visible:ring-destructive")}
                />
              </div>
              {depositError && (
                <p className="text-[11px] font-semibold text-destructive mt-1">{depositError}</p>
              )}
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Balance Due €</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">€</span>
                <Input
                  type="number"
                  readOnly
                  value={Math.max(0, (parseFloat(amount) || 0) - (parseFloat(depositAmount) || 0)).toFixed(2)}
                  className="pl-8 bg-muted/50 cursor-not-allowed"
                />
              </div>
            </div>
            <div className={`rounded-xl border p-4 flex justify-between items-center transition-colors ${sendDepositLink ? "border-success/40" : "border-border"}`}>
              <div>
                <div className="text-sm font-bold flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-success" /> Send deposit payment link?</div>
                <div className="text-xs text-muted-foreground mt-1">WhatsApp payment link to customer for deposit amount</div>
              </div>
              <Switch checked={sendDepositLink} onCheckedChange={setSendDepositLink} />
            </div>
          </>
        )}

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
          disabled={!orgReady}
          onClick={handleCreateJob}
        >
          {orgReady ? (
            <><CheckCircle2 className="w-5 h-5" /> Create Job</>
          ) : (
            <><Loader2 className="w-5 h-5 animate-spin" /> Checking organisation…</>
          )}
        </Button>

      </div>
    </div>
  );
};

/* ── helpers ──────────────────────────────────────────── */
const SALUTATIONS = ["mr", "mrs", "ms", "dr", "miss"];
const getFirstName = (fullName: string | undefined): string => {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1 && SALUTATIONS.includes(parts[0].toLowerCase().replace(/\.$/, ""))) {
    return parts[1];
  }
  return parts[0];
};

/* ── SUCCESS SCREEN ────────────────────────────────────── */
const SuccessScreen = ({ jobData, engineers, onClose, onNewJob, sendResults }: {
  jobData: any; engineers: any[]; onClose: () => void; onNewJob: () => void;
  sendResults: { confirmation?: SendResult; deposit?: SendResult };
}) => {
  const navigate = useNavigate();
  const eng = engineers.find((e: any) => e.id === jobData.schedule?.engineerId);
  const tb = DEFAULT_TIME_BLOCKS.find((t) => t.id === jobData.schedule?.timeBlock) || { label: jobData.schedule?.timeBlock };
  const jt = JOB_TYPES.find((j) => j.id === jobData.job?.jobType);
  const dateStr = (() => { try { return format(new Date(jobData.schedule.date + "T00:00:00"), "EEEE d MMMM"); } catch { return ""; } })();

  const firstName = getFirstName(jobData.customer?.name);
  const waMsg = `Hi ${firstName}! Your ${jt?.label?.toLowerCase() || "job"} is booked.\n\nDate: ${dateStr}\nTime: ${tb?.label}\nEngineer: ${eng?.name}\n\nWe'll be in touch if anything changes!`;

  const confirmation = sendResults?.confirmation;
  const deposit = sendResults?.deposit;
  const problems = [
    confirmation && confirmation.status !== "sent"
      ? { label: "Booking confirmation", result: confirmation }
      : null,
    deposit && deposit.status !== "sent" ? { label: "Deposit payment link", result: deposit } : null,
  ].filter(Boolean) as { label: string; result: SendResult }[];

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
          ...(confirmation && confirmation.status === "sent"
            ? [{ Icon: MessageCircle, text: "Booking confirmation sent via WhatsApp ✔" }]
            : []),
          ...(deposit && deposit.status === "sent"
            ? [{ Icon: CreditCard, text: "Deposit payment link sent via WhatsApp ✔" }]
            : []),
          { Icon: Bell, text: "Audit log updated" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 mb-2 last:mb-0">
            <item.Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-[13px] text-muted-foreground">{item.text}</span>
          </div>
        ))}
      </div>

      {problems.length > 0 && (
        <div className="bg-muted/40 border border-border rounded-xl p-3 w-full mb-5 text-left">
          {problems.map((p, i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5 last:mb-0">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-[12px] text-muted-foreground">
                {p.label} {p.result.status === "skipped" ? "skipped" : "failed"} — {p.result.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {confirmation?.status === "sent" && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-3 w-full mb-5 text-left">
          <div className="text-[10px] font-bold uppercase tracking-wider text-success mb-1.5 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp preview</div>
          <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{waMsg}</pre>
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
  const { orgId, ready: orgReady } = useOrgId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(prefilledCustomer ? 1 : 0);
  const [done, setDone] = useState(false);
  const [sendResults, setSendResults] = useState<{ confirmation?: SendResult; deposit?: SendResult }>({});
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

  const { data: settingsBlocks = [] } = useQuery({
    queryKey: ["slot-settings-blocks"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("job_time_blocks").limit(1).single();
      return (data?.job_time_blocks as any[] | null) || [];
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
    if (!user) {
      console.log("[NewJobPanel] submit blocked: no user");
      toast({ title: "Session issue", description: "Session issue — please refresh and try again.", variant: "destructive" });
      return;
    }
    if (!orgReady) {
      console.log("[NewJobPanel] submit blocked: org not ready");
      toast({ title: "Still loading", description: "Checking your organisation — please try again in a moment.", variant: "destructive" });
      return;
    }
    if (!orgId) {
      console.log("[NewJobPanel] submit blocked: orgId null");
      toast({ title: "Organisation not found", description: "Could not resolve your organisation — please refresh and try again.", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      let customerId = finalData.customer?.id;
      const isNewCustomer = finalData.customer?.isNew || customerId === "NEW";

      console.log("[NewJobPanel] Submit start", { customerId, isNewCustomer, customer: finalData.customer?.name });

      // Create new customer if needed
      if (isNewCustomer) {
        const nextServiceDue = new Date();
        nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
        const { data: newCust, error: custErr } = await supabase.from("customers").insert({
          user_id: user.id,
          organisation_id: orgId!,
          name: finalData.customer.name,
          phone: finalData.customer.phone,
          email: finalData.job?.email?.trim() || null,
          address: finalData.customer.address,
          eircode: finalData.customer.eircode || "",
          area_code: finalData.job?.areaCode?.trim() || null,
          boiler_brand: finalData.job?.boilerBrand || finalData.customer.boilerType || null,
          boiler_model: finalData.job?.boilerModelField || null,
          boiler_make_model: [finalData.job?.boilerBrand, finalData.job?.boilerModelField].filter(Boolean).join(" ") || finalData.customer.boilerType || null,
          boiler_type: finalData.job?.boilerType || null,
          gprn: finalData.job?.gprn?.trim() || null,
          boiler_location: finalData.job?.boilerLocation?.trim() || null,
          next_service_due: nextServiceDue.toISOString().split("T")[0],
          renewal_stage: "none",
          service_status: "active",
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
      // "Deposit Taken" only *requests* a deposit (a SumUp link is created/sent) — it is
      // not proof of payment. deposit_paid is flipped by the SumUp webhook or an
      // office/engineer-recorded payment. "Paid in Full" behaviour is unchanged.
      const depositRequired = finalData.payment.status === "deposit";
      const depositPaid = finalData.payment.status === "paid";

      console.log("[NewJobPanel] Inserting service_call", { customerId, jobType: finalData.job.jobType, date: finalData.schedule.date, engineer: eng?.name });

      const { data: newJob, error: jobErr } = await supabase.from("service_calls").insert({
        user_id: user.id,
        organisation_id: orgId!,
        customer_id: customerId,
        job_type: finalData.job.jobType,
        boiler_brand: finalData.job.boilerBrand || finalData.job.boilerModel || null,
        boiler_issue: finalData.job.notes || null,
        notes: finalData.job.notes || null,
        scheduled_date: finalData.schedule.date,
        time_block: buildTimeBlocks(settingsBlocks).find(t => t.id === finalData.schedule.timeBlock)?.dbValue || finalData.schedule.timeBlock,
        assigned_engineer_id: finalData.schedule.engineerId,
        assigned_engineer: eng?.name || null,
        status: "Booked",
        revenue: finalData.payment.amount || null,
        deposit_paid: depositPaid,
        deposit_required: depositRequired,
        deposit_amount: finalData.payment.status === "deposit" ? (finalData.payment.depositAmount || null) : null,
        balance_due: finalData.payment.status === "deposit" ? (finalData.payment.balanceDue || null) : null,
        source: "Manual",
        incoming_status: "Accepted",
        email: finalData.job.email || null,
        job_issue: finalData.job.jobIssue || null,
        extra_details: finalData.job.extraDetails || null,
        boiler_type: finalData.job.boilerType || null,
        boiler_error_code: finalData.job.boilerErrorCode || null,
        area_code: finalData.job.areaCode || null,
        owner_or_tenant: finalData.job.ownerOrTenant || null,
        access_notes: finalData.job.accessNotes || null,
      } as any).select("id, organisation_id, status").single();
      if (jobErr) {
        console.error("[NewJobPanel] insert failed:", jobErr);
        throw jobErr;
      }
      console.log("[NewJobPanel] insert succeeded:", {
        id: (newJob as any)?.id,
        organisation_id: (newJob as any)?.organisation_id,
        status: (newJob as any)?.status,
      });


      // Sync job fields back to existing customer profile
      if (!isNewCustomer) {
        const custUpdate: Record<string, string | null> = {};
        if (finalData.job?.boilerBrand?.trim()) custUpdate.boiler_brand = finalData.job.boilerBrand.trim();
        if (finalData.job?.boilerModelField?.trim()) custUpdate.boiler_model = finalData.job.boilerModelField.trim();
        const combinedMakeModel = [finalData.job?.boilerBrand?.trim(), finalData.job?.boilerModelField?.trim()].filter(Boolean).join(" ");
        if (combinedMakeModel) custUpdate.boiler_make_model = combinedMakeModel;
        if (finalData.job?.boilerType?.trim()) custUpdate.boiler_type = finalData.job.boilerType.trim();
        if (finalData.job?.areaCode?.trim()) custUpdate.area_code = finalData.job.areaCode.trim();
        if (finalData.job?.ownerOrTenant?.trim()) custUpdate.owner_or_tenant = finalData.job.ownerOrTenant.trim();
        if (finalData.job?.accessNotes?.trim()) custUpdate.access_notes = finalData.job.accessNotes.trim();
        if (finalData.job?.gprn?.trim()) custUpdate.gprn = finalData.job.gprn.trim();
        if (finalData.job?.boilerLocation?.trim()) custUpdate.boiler_location = finalData.job.boilerLocation.trim();
        if (Object.keys(custUpdate).length > 0) {
          await supabase.from("customers").update(custUpdate).eq("id", customerId);
        }
      }

      await logAudit({
        action_type: "job_created",
        entity_type: "service_call",
        entity_id: customerId,
        detail: `New ${finalData.job.jobType} for ${finalData.customer.name} on ${finalData.schedule.date}`,
      });

      // Send booking confirmation via WhatsApp Edge Function if toggle is ON
      const outcomes: { confirmation?: SendResult; deposit?: SendResult } = {};
      if (finalData.sendWhatsApp && newJob?.id) {
        let result: SendResult;
        try {
          const { data: waData, error: waErr } = await supabase.functions.invoke("send-booking-confirmation", {
            body: { service_call_id: newJob.id },
          });
          result = classifySendResult(waErr, waData);
          console.log("[NewJobPanel] Booking confirmation result:", result, waData, waErr);
        } catch (waEx) {
          console.error("[NewJobPanel] Booking confirmation WhatsApp exception:", waEx);
          result = classifySendResult(waEx, null);
        }
        outcomes.confirmation = result;
        if (result.status !== "sent") {
          toast({
            title: result.status === "skipped" ? "Booking confirmation not sent" : "Booking confirmation failed",
            description: `The job was created, but the confirmation was ${result.status} — ${result.message}.`,
            variant: result.status === "failed" ? "destructive" : "default",
          });
        }
      }

      // Send deposit payment link (SumUp + WhatsApp) if toggle is ON.
      // Only ever for "Deposit Taken" with a real amount — the toggle value is
      // already forced to false for other payment statuses.
      if (
        finalData.payment?.sendDepositLink &&
        Number(finalData.payment?.depositAmount || 0) > 0 &&
        newJob?.id
      ) {
        let result: SendResult;
        try {
          const { data: depRes, error: depErr } = await supabase.functions.invoke("send-deposit-link", {
            body: { service_call_id: newJob.id },
          });
          result = classifySendResult(depErr, depRes);
          console.log("[NewJobPanel] Deposit link result:", result, depRes, depErr);
        } catch (depEx) {
          console.error("[NewJobPanel] Deposit link exception:", depEx);
          result = classifySendResult(depEx, null);
        }
        outcomes.deposit = result;
        if (result.status !== "sent") {
          toast({
            title: "Deposit link not sent",
            description: `The job was created, but the deposit payment link was ${result.status} — ${result.message}. You can send it from the job.`,
            variant: result.status === "failed" ? "destructive" : "default",
          });
        }
      }

      setSendResults(outcomes);

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
    setSendResults({});
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
            <SuccessScreen jobData={jobData} engineers={engineers} onClose={onClose} onNewJob={handleNewJob} sendResults={sendResults} />
          ) : step === 0 ? (
            <StepCustomer prefilledCustomer={prefilledCustomer} onNext={handleCustomer} />
          ) : step === 1 ? (
            <StepJob prefilledType={prefilledJobType} prefilledBoiler={jobData.customer?.boiler_make_model || jobData.customer?.boilerType || ""} prefilledCustomer={jobData.customer} onNext={handleJob} onBack={() => setStep(0)} />
          ) : step === 2 ? (
            <StepSchedule prefilledDate={prefilledDate} prefilledBlock={prefilledBlock} prefilledEngineer={prefilledEngineer} onNext={handleSchedule} onBack={() => setStep(1)} />
          ) : (
            <StepPayment jobData={jobData} engineers={engineers} onSubmit={handleSubmit} onBack={() => setStep(2)} orgReady={orgReady} orgId={orgId} />
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
