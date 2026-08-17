import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, Loader2, PhoneOff, MessageCircle, CheckCircle2, CalendarCheck, Wallet, History, CalendarIcon, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import CustomerHistoryPanel from "@/components/customer/CustomerHistoryPanel";
import WhatsAppHistory from "@/components/whatsapp/WhatsAppHistory";
import ServiceHistory from "@/components/customer/ServiceHistory";
import CustomerHazardNotices from "@/components/customer/CustomerHazardNotices";
import CustomerQuotes from "@/components/customer/CustomerQuotes";
import PaymentHistory from "@/components/customer/PaymentHistory";
import CustomerActivityTimeline from "@/components/customer/CustomerActivityTimeline";
import SendReminderModal from "@/components/whatsapp/SendReminderModal";
import DeleteCustomerModal from "@/components/customer/DeleteCustomerModal";
import { useLastCompletedService } from "@/hooks/useLastCompletedService";
import CustomerFormField from "@/components/shared/CustomerFormField";
import { buildCustomerUpdatePayload } from "@/lib/customerUpdatePayload";

import {
  validateRequired, validatePhone, validatePhoneLegacyShape, validateLandline, validateEircode, validateAreaCode,
  formatEircode, formatPhoneInternational, normalizeAreaCode, RED_BORDER, type CustomerFieldErrors,
} from "@/lib/customerValidation";

const formatDateForInput = (val: string | null) => val || "";

interface BoilerBrandRow {
  brand_name: string;
  model_name: string | null;
  is_default: boolean;
}

// Collapsible accordion section component
const CollapsibleSection = ({ title, count, children, defaultOpen = false }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 min-h-[52px] cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <Badge variant="secondary" className="text-[11px] font-bold px-2 py-0">
              {count}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <CardContent className="pt-0 pb-4">
          {children}
        </CardContent>
      </div>
    </Card>
  );
};

// Hazard section that only renders when data exists
const HazardSection = ({ customerId, onCountReady }: { customerId: string; onCountReady?: (n: number) => void }) => {
  const [count, setCount] = useState<number | null>(null);

  const handleCount = (n: number) => {
    setCount(n);
    onCountReady?.(n);
  };

  if (count === 0) return null;

  return (
    <CollapsibleSection title="⚠️ Hazard Notices" count={count ?? undefined}>
      <CustomerHazardNotices customerId={customerId} onCountReady={handleCount} />
    </CollapsibleSection>
  );
};

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { registerGuard, guardedNavigate } = useNavigationGuard();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [originalForm, setOriginalForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<CustomerFieldErrors>({});
  const [showSendModal, setShowSendModal] = useState(false);
  const { data: lastService } = useLastCompletedService(id);
  const [showHistory, setShowHistory] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [boilerBrands, setBoilerBrands] = useState<BoilerBrandRow[]>([]);
  const [modelManual, setModelManual] = useState(false);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  // Dirty check
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm);

  // Register navigation guard — blocks sidebar/nav clicks when dirty
  const isDirtyRef = useCallback(() => isDirty, [isDirty]);
  useEffect(() => {
    const unregister = registerGuard(isDirtyRef);
    return unregister;
  }, [registerGuard, isDirtyRef]);

  useEffect(() => {
    if (user?.id && id) {
      fetchCustomer();
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) setSettings(data);
      });
      supabase.from("boiler_brands").select("brand_name, model_name, is_default").then(({ data }) => {
        if (data) setBoilerBrands(data as BoilerBrandRow[]);
      });

      const channel = supabase
        .channel(`customer-${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${id}` },
          (payload) => {
            const newOptedOut = (payload.new as any)?.opted_out;
            if (typeof newOptedOut === 'boolean') {
              setForm((prev) => ({ ...prev, opted_out: newOptedOut }));
              setOriginalForm((prev) => ({ ...prev, opted_out: newOptedOut }));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  const fetchCustomer = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Customer not found", variant: "destructive" });
      navigate("/dashboard");
      return;
    }
    setForm(data);
    setOriginalForm(data);
    setLoading(false);
  };

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  // Legacy records may hold a landline in `phone` (pre-dates the mobile-only rule).
  // Only enforce the strict mobile check when the user has actually edited the field.
  const validatePhoneField = (val: string): string | null => {
    const untouched = String(originalForm?.phone ?? "") === val;
    return untouched ? validatePhoneLegacyShape(val) : validatePhone(val);
  };

  const blurField = (field: string) => {
    const val = String(form[field] ?? "");
    let err: string | null = null;
    if (field === "name") err = validateRequired(val);
    else if (field === "phone") err = validatePhoneField(val);
    else if (field === "landline_phone") err = validateLandline(val);
    else if (field === "eircode") {
      err = validateEircode(val);
      if (!err) handleChange("eircode", formatEircode(val));
    } else if (field === "area_code") err = validateAreaCode(val);
    if (err) setErrors((e) => ({ ...e, [field]: err! }));
  };

  const validateAll = (): boolean => {
    const e: CustomerFieldErrors = {};
    const nameErr = validateRequired(String(form.name ?? "")); if (nameErr) e.name = nameErr;
    const phoneErr = validatePhoneField(String(form.phone ?? "")); if (phoneErr) e.phone = phoneErr;
    const eircodeErr = validateEircode(String(form.eircode ?? "")); if (eircodeErr) e.eircode = eircodeErr;
    const areaErr = validateAreaCode(String(form.area_code ?? "")); if (areaErr) e.area_code = areaErr;
    const landlineErr = validateLandline(String(form.landline_phone ?? "")); if (landlineErr) e.landline_phone = landlineErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  };


  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    // Only send fields the user actually changed. Sending the whole fetched row
    // could overwrite backend-updated values (e.g. opted_out flipped by an
    // inbound WhatsApp "STOP") with stale local form state.
    const updates = buildCustomerUpdatePayload(form, originalForm);
    if (Object.keys(updates).length === 0) {
      setSaving(false);
      toast({ title: "No changes to save" });
      return;
    }
    // Clean phone & eircode
    if (updates.phone) updates.phone = formatPhoneInternational(updates.phone);
    if (updates.eircode) updates.eircode = formatEircode(updates.eircode);
    if (updates.area_code) updates.area_code = normalizeAreaCode(updates.area_code);
    // Ensure required fields are never null
    if ("eircode" in updates && !updates.eircode) updates.eircode = "";
    if ("address" in updates && !updates.address) updates.address = "";
    // TEMP: keep boiler_make_model in sync until downstream consumers
    // migrate to boiler_brand/boiler_model (DayJobsPanel, WarrantyDetail,
    // WarrantyTracker, JobSlotDrawer, NewJobPanel, EngineerJobDetail,
    // BoilerBrandsTab, IncomingJobCard, DataTab export,
    // CertificateFlow.tsx, Cert2Flow.tsx,
    // supabase/functions/generate-cert2-pdf/index.ts).
    if ("boiler_brand" in updates || "boiler_model" in updates) {
      const brand = (form.boiler_brand || "").trim();
      const model = (form.boiler_model || "").trim();
      updates.boiler_make_model = [brand, model].filter(Boolean).join(" ") || null;
    }
    // Clean partial boiler_installation_date (incomplete dropdown selection)
    if (typeof updates.boiler_installation_date === "string" && updates.boiler_installation_date.startsWith("__partial__")) {
      updates.boiler_installation_date = null;
    }
    const { error } = await supabase.from("customers").update(updates).eq("id", id);

    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      // Sync boiler details to active service_calls for this customer
      const boilerBrand = (updates.boiler_brand || "").trim();
      const boilerModel = (updates.boiler_model || "").trim();
      if (boilerBrand || boilerModel) {
        try {
          await supabase
            .from("service_calls")
            .update({
              boiler_brand: boilerBrand || null,
            } as any)
            .eq("customer_id", id)
            .not("status", "in", '("Completed","Cancelled")');
          toast({ title: "Customer saved", description: "Boiler details synced to active jobs" });
        } catch (syncErr) {
          console.error("[CustomerDetail] Boiler sync to jobs failed:", syncErr);
          toast({ title: "Customer saved" });
        }
      } else {
        toast({ title: "Customer saved" });
      }
      setOriginalForm({ ...form });
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer deleted" });
      navigate("/dashboard");
    }
  };

  const handleBackButton = () => {
    guardedNavigate("/dashboard");
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const formatDisplayDate = (val: string | null) => {
    if (!val) return "";
    try { return new Date(val + "T12:00:00").toLocaleDateString("en-IE"); } catch { return val; }
  };

  // Generic field for non-validated fields
  const PlainField = ({ label, field, type = "text", value }: { label: string; field: string; type?: string; value: any }) => {
    const [localValue, setLocalValue] = useState(value ?? "");

    useEffect(() => {
      setLocalValue(value ?? "");
    }, [value]);

    if (type === "date") {
      const dateValue = value ? new Date(value + "T12:00:00") : undefined;
      const isValidDate = dateValue && !isNaN(dateValue.getTime());
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field} className="text-xs text-muted-foreground">{label}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-10",
                  !isValidDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {isValidDate ? format(dateValue, "dd/MM/yyyy") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={isValidDate ? dateValue : undefined}
                onSelect={(d) => handleChange(field, d ? format(d, "yyyy-MM-dd") : null)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label htmlFor={field} className="text-xs text-muted-foreground">{label}</Label>
        <Input
          id={field}
          type={type}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => handleChange(field, localValue)}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBackButton}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{form.name}</h1>
              <Badge variant={form.service_status === "Overdue" ? "destructive" : form.service_status === "Due Soon" ? "secondary" : "default"} className="mt-0.5">
                {form.service_status || "Up to Date"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Save</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteModal(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contact Information</CardTitle>
              <Button
                variant={showHistory ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-3.5 h-3.5" /> History
              </Button>
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent className="border-b border-border pb-4 mb-0">
              <CustomerHistoryPanel customerId={id!} customer={form} />
            </CardContent>
          )}
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomerFormField label="Customer Name" id="name" value={form.name ?? ""} onChange={(v) => handleChange("name", v)} onBlur={() => blurField("name")} error={errors.name} required maxLength={100} />
            <CustomerFormField label="Mobile Number" id="phone" value={form.phone ?? ""} onChange={(v) => handleChange("phone", v)} onBlur={() => blurField("phone")} error={errors.phone} required maxLength={30} placeholder="083 123 4567" />
            <CustomerFormField label="Landline (optional)" id="landline_phone" value={form.landline_phone ?? ""} onChange={(v) => handleChange("landline_phone", v)} onBlur={() => blurField("landline_phone")} error={errors.landline_phone} maxLength={30} placeholder="01 441 2618" />

            <PlainField label="Email" field="email" value={form.email} />
            <PlainField label="Address" field="address" value={form.address} />
            <CustomerFormField label="Eircode" id="eircode" value={form.eircode ?? ""} onChange={(v) => handleChange("eircode", v)} onBlur={() => blurField("eircode")} error={errors.eircode} required maxLength={10} placeholder="D01 X2Y3" />
            <CustomerFormField label="Area Code" id="area_code" value={form.area_code ?? ""} onChange={(v) => handleChange("area_code", v)} onBlur={() => blurField("area_code")} error={errors.area_code} maxLength={10} placeholder="e.g. D14" />
            <CustomerFormField label="GPRN" id="gprn" value={form.gprn ?? ""} onChange={(v) => handleChange("gprn", v)} maxLength={30} placeholder="Gas Point Reference Number" />
            <div className="space-y-1.5">
              <Label htmlFor="owner_or_tenant" className="text-xs text-muted-foreground">Owner or Tenant</Label>
              <Select value={form.owner_or_tenant || ""} onValueChange={(v) => handleChange("owner_or_tenant", v)}>
                <SelectTrigger id="owner_or_tenant"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Owner">Owner</SelectItem>
                  <SelectItem value="Tenant">Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-input px-3 py-2.5">
              <div>
                <Label htmlFor="opted_out" className="text-sm font-medium text-foreground">Opt out of service reminders</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">This customer won't receive automated renewal reminders</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold", form.opted_out ? "text-red-500" : "text-green-500")}>
                  {form.opted_out ? "Opted Out" : "Receiving WhatsApp"}
                </span>
                <Switch
                  id="opted_out"
                  checked={!!form.opted_out}
                  onCheckedChange={(v) => handleChange("opted_out", v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Boiler Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Boiler Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Boiler Brand — typeahead */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs text-muted-foreground">Boiler Brand</Label>
              <div className="relative">
                <Input
                  value={form.boiler_brand ?? ""}
                  onChange={(e) => {
                    handleChange("boiler_brand", e.target.value);
                    setBrandQuery(e.target.value);
                    if (!brandDropdownOpen) setBrandDropdownOpen(true);
                    if (e.target.value !== form.boiler_brand) { handleChange("boiler_model", ""); setModelQuery(""); }
                  }}
                  onFocus={() => { setBrandDropdownOpen(true); setBrandQuery(form.boiler_brand ?? ""); }}
                  onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 200)}
                  placeholder="e.g. Ideal, Worcester, Vaillant"
                  className="pr-9"
                  autoComplete="off"
                />
                <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => setBrandDropdownOpen(!brandDropdownOpen)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className={`w-4 h-4 transition-transform ${brandDropdownOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {brandDropdownOpen && (() => {
                const q = (brandQuery || "").toLowerCase();
                const matches = boilerBrands
                  .filter(b => b.is_default && (q === "" || b.brand_name.toLowerCase().includes(q)))
                  .map(b => b.brand_name)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .sort()
                  .slice(0, 8);
                return matches.length > 0 ? (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {matches.map(b => (
                      <button key={b} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { handleChange("boiler_brand", b); setBrandQuery(b); setBrandDropdownOpen(false); handleChange("boiler_model", ""); setModelQuery(""); }} className="w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors">{b}</button>
                    ))}
                  </div>
                ) : null;
              })()}
              <p className="text-[11px] text-muted-foreground">Start typing or click to see options</p>
            </div>
            {/* Boiler Model — typeahead when brand selected */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs text-muted-foreground">Boiler Model</Label>
              <div className="relative">
                <Input
                  value={form.boiler_model ?? ""}
                  onChange={(e) => {
                    handleChange("boiler_model", e.target.value);
                    setModelQuery(e.target.value);
                    if (!modelDropdownOpen && (form.boiler_brand ?? "").trim()) setModelDropdownOpen(true);
                  }}
                  onFocus={() => { if ((form.boiler_brand ?? "").trim()) { setModelDropdownOpen(true); setModelQuery(form.boiler_model ?? ""); } }}
                  onBlur={() => setTimeout(() => setModelDropdownOpen(false), 200)}
                  placeholder="e.g. Logic Heat 18"
                  className="pr-9"
                  autoComplete="off"
                />
                <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => { if ((form.boiler_brand ?? "").trim()) setModelDropdownOpen(!modelDropdownOpen); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className={`w-4 h-4 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {modelDropdownOpen && (() => {
                const brand = (form.boiler_brand ?? "").trim();
                const q = (modelQuery || "").toLowerCase();
                const matches = boilerBrands
                  .filter(b => !b.is_default && b.brand_name === brand && b.model_name && (q === "" || b.model_name.toLowerCase().includes(q)))
                  .map(b => b.model_name!)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .sort()
                  .slice(0, 8);
                return matches.length > 0 ? (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {matches.map(m => (
                      <button key={m} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { handleChange("boiler_model", m); setModelQuery(m); setModelDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors">{m}</button>
                    ))}
                  </div>
                ) : null;
              })()}
              <p className="text-[11px] text-muted-foreground">Start typing or click to see options</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boiler Type</Label>
              <Select value={form.boiler_type || ""} onValueChange={(v) => handleChange("boiler_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gas">Gas</SelectItem>
                  <SelectItem value="Oil">Oil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Installation Date</Label>
              {(() => {
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => currentYear - i);
                const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                const days = Array.from({ length: 31 }, (_, i) => i + 1);

                // Parse existing YYYY-MM-DD or __partial__:Y:M:D value into individual parts
                let selYear = "";
                let selMonth = "";
                let selDay = "";
                const rawVal = form.boiler_installation_date || "";
                if (rawVal.startsWith("__partial__:")) {
                  const pp = rawVal.split(":");
                  selYear = pp[1] || "";
                  selMonth = pp[2] || "";
                  selDay = pp[3] || "";
                } else if (rawVal) {
                  const parts = rawVal.split("-");
                  if (parts.length === 3) {
                    selYear = parts[0];
                    selMonth = String(parseInt(parts[1], 10));
                    selDay = String(parseInt(parts[2], 10));
                  }
                }

                const buildDateFromParts = (y: string, m: string, d: string) => {
                  if (!y || !m || !d) return null;
                  const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  console.log("[CustomerDetail] buildDateFromParts:", dateStr);
                  return dateStr;
                };

                return (
                  <div className="flex gap-2">
                    <Select value={selDay} onValueChange={(v) => {
                      const result = buildDateFromParts(selYear, selMonth, v);
                      if (result) handleChange("boiler_installation_date", result);
                      else handleChange("boiler_installation_date", `__partial__:${selYear || ""}:${selMonth || ""}:${v}`);
                    }}>
                      <SelectTrigger className="w-[80px]"><SelectValue placeholder="Day" /></SelectTrigger>
                      <SelectContent>
                        {days.map((d) => (
                          <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selMonth} onValueChange={(v) => {
                      const result = buildDateFromParts(selYear, v, selDay);
                      if (result) handleChange("boiler_installation_date", result);
                      else handleChange("boiler_installation_date", `__partial__:${selYear || ""}:${v}:${selDay || ""}`);
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Month" /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selYear} onValueChange={(v) => {
                      const result = buildDateFromParts(v, selMonth, selDay);
                      if (result) handleChange("boiler_installation_date", result);
                      else handleChange("boiler_installation_date", `__partial__:${v}:${selMonth || ""}:${selDay || ""}`);
                    }}>
                      <SelectTrigger className="w-[90px]"><SelectValue placeholder="Year" /></SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
            </div>
            {/* Warranty Years */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Warranty Years</Label>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 5, 7, 10"
                value={form.warranty_years ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange("warranty_years", v === "" ? null : parseInt(v, 10));
                }}
              />
            </div>
            {/* Warranty Expiry — calculated display */}
            {(() => {
              const installRaw = form.boiler_installation_date;
              const wYears = form.warranty_years;
              const hasInstall = installRaw && !installRaw.startsWith("__partial__");
              let expiryDate: Date | null = null;
              if (hasInstall && wYears != null) {
                expiryDate = new Date(installRaw + "T12:00:00");
                expiryDate.setFullYear(expiryDate.getFullYear() + wYears);
              }
              const expiryStr = expiryDate
                ? expiryDate.toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" })
                : "—";

              let statusLabel = "—";
              let statusClass = "bg-muted text-muted-foreground";
              if (expiryDate) {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const diff = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                if (expiryDate < now) {
                  statusLabel = "Expired";
                  statusClass = "bg-red-100 text-red-700";
                } else if (diff <= 90) {
                  statusLabel = "Expiring Soon";
                  statusClass = "bg-amber-100 text-amber-700";
                } else {
                  statusLabel = "Under Warranty";
                  statusClass = "bg-green-100 text-green-700";
                }
              }

              return (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Warranty Expiry</Label>
                    <div className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground items-center">
                      {expiryStr}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Warranty Status</Label>
                    <div className="flex h-10 w-full items-center">
                      {statusLabel === "—" ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Service Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlainField label="Last Service Date" field="last_service_date" type="date" value={form.last_service_date} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last Service Engineer</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground items-center">
                {lastService?.engineerName || "—"}
              </div>
            </div>
            <PlainField label="Next Service Due" field="next_service_due" type="date" value={form.next_service_due} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service Status</Label>
              <Select value={form.service_status || "Up to Date"} onValueChange={(v) => handleChange("service_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Up to Date">Up to Date</SelectItem>
                  <SelectItem value="Serviced">Serviced</SelectItem>
                  <SelectItem value="Due Soon">Due Soon</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Renewal Stage</Label>
              <Select value={form.renewal_stage || "not_contacted"} onValueChange={(v) => handleChange("renewal_stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_contacted">
                    <span className="flex items-center gap-1.5"><PhoneOff className="w-3.5 h-3.5 text-destructive" /> Not Contacted</span>
                  </SelectItem>
                  <SelectItem value="reminded">
                    <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-warning" /> Reminded</span>
                  </SelectItem>
                  <SelectItem value="confirmed">
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#0891B2]" /> Confirmed</span>
                  </SelectItem>
                  <SelectItem value="booked">
                    <span className="flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5 text-primary" /> Booked In</span>
                  </SelectItem>
                  <SelectItem value="paid">
                    <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-success" /> Paid</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PlainField label="Assigned Engineer" field="assigned_engineer" value={form.assigned_engineer} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Customer Since</Label>
              {(() => {
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => currentYear - i);
                const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                const days = Array.from({ length: 31 }, (_, i) => i + 1);
                const existing = form.customer_since ? form.customer_since.split("-") : [null, null, null];
                const selYear = existing[0] || "";
                const selMonth = existing[1] ? String(parseInt(existing[1])) : "";
                const selDay = existing[2] ? String(parseInt(existing[2])) : "";

                const buildCsDate = (y: string, m: string, d: string) => {
                  if (!y || !m) return null;
                  const dayVal = d || "1";
                  const monthStr = m.padStart(2, "0");
                  const dayStr = String(dayVal).padStart(2, "0");
                  return `${y}-${monthStr}-${dayStr}`;
                };

                return (
                  <div className="flex gap-2">
                    <Select value={selDay} onValueChange={(v) => handleChange("customer_since", buildCsDate(selYear, selMonth, v))}>
                      <SelectTrigger className="w-[80px]"><SelectValue placeholder="Day" /></SelectTrigger>
                      <SelectContent>
                        {days.map((d) => (
                          <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selMonth} onValueChange={(v) => handleChange("customer_since", buildCsDate(selYear, v, selDay))}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Month" /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selYear} onValueChange={(v) => handleChange("customer_since", buildCsDate(v, selMonth || "1", selDay))}>
                      <SelectTrigger className="w-[90px]"><SelectValue placeholder="Year" /></SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Job Tag Badge */}
            {form.job_tag && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs font-bold bg-primary/10 text-primary">
                  {form.job_tag}
                </Badge>
                {form.job_tag_date && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {format(parseISO(form.job_tag_date + "T00:00:00"), "dd/MM/yyyy")}
                  </span>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Access Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.access_notes ?? ""}
                onChange={(e) => handleChange("access_notes", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Engineer Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.engineer_notes ?? ""}
                onChange={(e) => handleChange("engineer_notes", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Customer Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.notes ?? ""}
                onChange={(e) => handleChange("notes", e.target.value || null)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Collapsible Sections */}
        {id && (
          <div className="space-y-3">
            <CollapsibleSection title="Activity Timeline" count={sectionCounts.activity} defaultOpen={true}>
              <CustomerActivityTimeline customerId={id} onCountReady={(n) => setSectionCounts(prev => ({ ...prev, activity: n }))} />
            </CollapsibleSection>

            <WhatsAppHistory
              customerId={id}
              onSendMessage={() => setShowSendModal(true)}
            />

            <CollapsibleSection title="Payments & Activity" count={sectionCounts.payments}>
              <PaymentHistory customerId={id} onCountReady={(n) => setSectionCounts(prev => ({ ...prev, payments: n }))} />
            </CollapsibleSection>

            <CollapsibleSection title="Quotes" count={sectionCounts.quotes}>
              <CustomerQuotes customerId={id} onCountReady={(n) => setSectionCounts(prev => ({ ...prev, quotes: n }))} />
            </CollapsibleSection>

            <CollapsibleSection title="Service History & Certificates" count={(sectionCounts.serviceJobs ?? 0) + (sectionCounts.certs ?? 0)}>
              <ServiceHistory customerId={id} onCountsReady={(jobCount, certCount) => setSectionCounts(prev => ({ ...prev, serviceJobs: jobCount, certs: certCount }))} />
            </CollapsibleSection>

            {/* Hazard Notices — only renders when data exists */}
            <HazardSection customerId={id} onCountReady={(n) => setSectionCounts(prev => ({ ...prev, hazards: n }))} />
          </div>
        )}
      </div>

      {/* Delete Customer Modal */}
      <DeleteCustomerModal
        open={showDeleteModal}
        customerName={form.name || ""}
        onConfirm={() => { setShowDeleteModal(false); handleDelete(); }}
        onCancel={() => setShowDeleteModal(false)}
      />

      {/* Send Reminder Modal */}
      {showSendModal && form.name && (
        <SendReminderModal
          customer={{ id: id!, name: form.name, phone: form.phone, next_service_due: form.next_service_due }}
          settings={settings}
          open={showSendModal}
          onClose={() => setShowSendModal(false)}
          onSent={() => {}}
        />
      )}
    </div>
  );
};

export default CustomerDetail;
