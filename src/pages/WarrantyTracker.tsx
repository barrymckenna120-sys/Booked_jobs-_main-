import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Shield, ArrowUpDown, X } from "lucide-react";
import { toast } from "sonner";

interface BoilerBrand {
  brand_name: string;
  model_name: string | null;
  warranty_years: number;
  is_default: boolean;
}

interface CustomerWarranty {
  id: string;
  name: string;
  phone: string;
  address: string;
  boiler_make_model: string | null;
  boiler_brand: string | null;
  boiler_model: string | null;
  boiler_installation_date: string | null;
  last_service_date: string | null;
  notes: string | null;
  warranty_reminder_log: any[];
  brand: string;
  warrantyYears: number;
  expiryDate: Date;
  daysLeft: number;
  percentUsed: number;
}

function parseDateSafe(dateStr: string): Date {
  return new Date(dateStr + "T12:00:00");
}

function formatDateIE(date: Date): string {
  return date.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
}

function formatDaysLeft(days: number): string {
  if (days < 0) {
    const absDays = Math.abs(days);
    if (absDays >= 365) {
      const yrs = Math.floor(absDays / 365);
      const mos = Math.floor((absDays % 365) / 30);
      return mos > 0 ? `${yrs}yr ${mos}mo overdue` : `${yrs}yr overdue`;
    }
    if (absDays >= 30) return `${Math.floor(absDays / 30)}mo overdue`;
    return `${absDays}d overdue`;
  }
  if (days >= 365) {
    const yrs = Math.floor(days / 365);
    const mos = Math.floor((days % 365) / 30);
    return mos > 0 ? `${yrs}yr ${mos}mo left` : `${yrs}yr left`;
  }
  if (days >= 30) {
    const mos = Math.floor(days / 30);
    const d = days % 30;
    return d > 0 ? `${mos}mo ${d}d left` : `${mos}mo left`;
  }
  return `${days}d left`;
}

function daysLeftBg(days: number): string {
  if (days <= 30) return "bg-red-100 text-red-700";
  if (days <= 90) return "bg-amber-100 text-amber-700";
  if (days <= 365) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}

function resolveWarrantyYears(makeModel: string, brands: BoilerBrand[]): { brand: string; warrantyYears: number } {
  const mm = makeModel.trim().toLowerCase();

  // Try model-level match first (is_default = false)
  const modelRows = brands.filter((b) => !b.is_default && b.model_name);
  for (const row of modelRows) {
    const fullName = `${row.brand_name} ${row.model_name}`.toLowerCase();
    if (mm.includes(fullName) || mm.startsWith(fullName)) {
      return { brand: row.brand_name, warrantyYears: row.warranty_years };
    }
  }

  // Try brand-level default match
  const defaultRows = brands.filter((b) => b.is_default);
  // Sort by name length descending so "Worcester Bosch" matches before "Worcester"
  defaultRows.sort((a, b) => b.brand_name.length - a.brand_name.length);
  for (const row of defaultRows) {
    if (mm.startsWith(row.brand_name.toLowerCase()) || mm.includes(row.brand_name.toLowerCase())) {
      return { brand: row.brand_name, warrantyYears: row.warranty_years };
    }
  }

  // Fallback
  return { brand: "Unknown", warrantyYears: 10 };
}

const TIME_PERIODS = [
  { label: "New Install (Last 30 Days)", value: "new_install", maxDays: Infinity },
  { label: "All Customers", value: "all", maxDays: Infinity },
  { label: "Expired", value: "expired", maxDays: -1 },
  { label: "Expiring in 1 Month", value: "1m", maxDays: 30 },
  { label: "Expiring in 3 Months", value: "3m", maxDays: 90 },
  { label: "Expiring in 6 Months", value: "6m", maxDays: 180 },
  { label: "Expiring in 1 Year", value: "1y", maxDays: 365 },
  { label: "Expiring in 2 Years", value: "2y", maxDays: 730 },
  { label: "Expiring in 3 Years", value: "3y", maxDays: 1095 },
];

const SORT_OPTIONS = [
  { label: "Expiry Date", value: "expiry" },
  { label: "Name A–Z", value: "name" },
  { label: "Brand", value: "brand" },
];

const WarrantyTracker = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [brands, setBrands] = useState<BoilerBrand[]>([]);
  const [customers, setCustomers] = useState<CustomerWarranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("3m");
  const [sortBy, setSortBy] = useState("expiry");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  const distinctBrands = useMemo(() => {
    const set = new Set(brands.filter((b) => b.is_default).map((b) => b.brand_name));
    return Array.from(set).sort();
  }, [brands]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [brandsRes, customersRes] = await Promise.all([
        supabase.from("boiler_brands").select("brand_name, model_name, warranty_years, is_default"),
        supabase
          .from("customers")
          .select("id, name, phone, address, boiler_make_model, boiler_brand, boiler_model, boiler_installation_date, last_service_date, notes, warranty_reminder_log")
          .not("boiler_installation_date", "is", null),
      ]);

      const brandsData = (brandsRes.data || []) as BoilerBrand[];
      setBrands(brandsData);

      const today = new Date();
      today.setHours(12, 0, 0, 0);

      const mapped: CustomerWarranty[] = (customersRes.data || [])
        .map((c: any) => {
          const makeModel = (c.boiler_make_model || "").trim();
          if (!makeModel && !c.boiler_brand) return null;

          // Use boiler_brand directly if available, otherwise fall back to parsing
          let brand: string;
          let warrantyYears: number;
          if (c.boiler_brand) {
            const resolved = resolveWarrantyYears(c.boiler_brand + " " + (c.boiler_model || ""), brandsData);
            brand = c.boiler_brand;
            warrantyYears = resolved.warrantyYears;
          } else {
            const resolved = resolveWarrantyYears(makeModel, brandsData);
            brand = resolved.brand;
            warrantyYears = resolved.warrantyYears;
          }

          const installDate = parseDateSafe(c.boiler_installation_date);
          const expiryDate = new Date(installDate);
          expiryDate.setFullYear(expiryDate.getFullYear() + warrantyYears);

          const daysLeft = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const totalDays = warrantyYears * 365;
          const elapsed = totalDays - daysLeft;
          const percentUsed = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));

          const reminderLog = Array.isArray(c.warranty_reminder_log) ? c.warranty_reminder_log : [];

          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            address: c.address,
            boiler_make_model: c.boiler_make_model,
            boiler_brand: c.boiler_brand,
            boiler_model: c.boiler_model,
            boiler_installation_date: c.boiler_installation_date,
            last_service_date: c.last_service_date,
            notes: c.notes,
            warranty_reminder_log: reminderLog,
            brand,
            warrantyYears,
            expiryDate,
            daysLeft,
            percentUsed,
          } as CustomerWarranty;
        })
        .filter(Boolean) as CustomerWarranty[];

      setCustomers(mapped);
      setLoading(false);
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    let result = [...customers];

    if (brandFilter !== "all") {
      result = result.filter((c) => c.brand === brandFilter);
    }

    const period = TIME_PERIODS.find((p) => p.value === periodFilter);
    if (period) {
      if (period.value === "new_install") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setHours(12, 0, 0, 0);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        result = result.filter((c) => {
          const installDate = parseDateSafe(c.boiler_installation_date!);
          return installDate >= thirtyDaysAgo;
        });
      } else if (period.value === "expired") {
        result = result.filter((c) => c.daysLeft < 0);
      } else if (period.value !== "all") {
        result = result.filter((c) => c.daysLeft <= period.maxDays);
      }
    }

    if (sortBy === "expiry") {
      result.sort((a, b) => a.daysLeft - b.daysLeft);
    } else if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "brand") {
      result.sort((a, b) => a.brand.localeCompare(b.brand) || a.daysLeft - b.daysLeft);
    }

    return result;
  }, [customers, brandFilter, periodFilter, sortBy]);

  const brandBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((c) => {
      map[c.brand] = (map[c.brand] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  function formatMonthYear(date: Date): string {
    return date.toLocaleDateString("en-IE", { month: "long", year: "numeric" });
  }

  function buildWarrantyMessage(c: CustomerWarranty): string {
    const firstName = c.name.split(/\s+/)[0];
    const makeModel = c.boiler_make_model || "boiler";
    const installDate = parseDateSafe(c.boiler_installation_date!);
    return `Hi ${firstName}, this is Nicole from K&N Gas Services.\n\nWe are getting in touch to let you know your ${makeModel} boiler, installed in ${formatMonthYear(installDate)}, is currently covered under the manufacturer's warranty until ${formatMonthYear(c.expiryDate)}.\n\n⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\nWe would love to take care of that for you. Reply to this message or call us to book your annual service.\n\nK&N Gas Services\n📞 087 3685252`;
  }

  const STAGE_ORDER: Record<string, number> = { not_contacted: 0, reminded: 1, confirmed: 2, booked_in: 3, paid: 4 };

  const handleBulkSend = async () => {
    setShowConfirm(false);
    const targets = filtered.filter((c) => selected.has(c.id));
    if (targets.length === 0) return;
    setSending(true);
    setSendProgress({ current: 0, total: targets.length });
    let success = 0;
    const failed: string[] = [];
    const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Office";

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      setSendProgress({ current: i + 1, total: targets.length });
      try {
        const { error } = await supabase.functions.invoke("send-warranty-whatsapp", {
          body: { phone: c.phone, message: buildWarrantyMessage(c), customer_id: c.id, customer_name: c.name },
        });
        if (error) throw error;

        const newEntry = { sent_at: new Date().toISOString(), sent_by: displayName };
        const updatedLog = [...c.warranty_reminder_log, newEntry];
        const updates: Record<string, any> = { warranty_reminder_log: updatedLog };
        const currentStage = (c as any).renewal_stage || "not_contacted";
        if ((STAGE_ORDER[currentStage] ?? 0) < (STAGE_ORDER["reminded"] ?? 1)) {
          updates.renewal_stage = "reminded";
        }
        await supabase.from("customers").update(updates as any).eq("id", c.id);
        success++;
      } catch (_err) {
        failed.push(c.name);
      }
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setSending(false);
    setSelected(new Set());
    toast(failed.length === 0
      ? `✅ ${success} sent successfully`
      : `✅ ${success} sent successfully, ${failed.length} failed: ${failed.join(", ")}`);

    // Refresh data
    setLoading(true);
    const [brandsRes, customersRes] = await Promise.all([
      supabase.from("boiler_brands").select("brand_name, model_name, warranty_years, is_default"),
      supabase.from("customers")
        .select("id, name, phone, address, boiler_make_model, boiler_brand, boiler_model, boiler_installation_date, last_service_date, notes, warranty_reminder_log, renewal_stage")
        .not("boiler_installation_date", "is", null),
    ]);
    const brandsData = (brandsRes.data || []) as BoilerBrand[];
    setBrands(brandsData);
    const today2 = new Date(); today2.setHours(12, 0, 0, 0);
    const mapped2: CustomerWarranty[] = (customersRes.data || []).map((c2: any) => {
      const makeModel = (c2.boiler_make_model || "").trim();
      if (!makeModel && !c2.boiler_brand) return null;
      let brand2: string; let warrantyYears2: number;
      if (c2.boiler_brand) {
        const r = resolveWarrantyYears(c2.boiler_brand + " " + (c2.boiler_model || ""), brandsData);
        brand2 = c2.boiler_brand; warrantyYears2 = r.warrantyYears;
      } else {
        const r = resolveWarrantyYears(makeModel, brandsData);
        brand2 = r.brand; warrantyYears2 = r.warrantyYears;
      }
      const installDate = parseDateSafe(c2.boiler_installation_date);
      const expiryDate = new Date(installDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + warrantyYears2);
      const daysLeft = Math.floor((expiryDate.getTime() - today2.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = warrantyYears2 * 365;
      const elapsed = totalDays - daysLeft;
      const percentUsed = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
      const reminderLog = Array.isArray(c2.warranty_reminder_log) ? c2.warranty_reminder_log : [];
      return { ...c2, brand: brand2, warrantyYears: warrantyYears2, expiryDate, daysLeft, percentUsed, warranty_reminder_log: reminderLog } as CustomerWarranty;
    }).filter(Boolean) as CustomerWarranty[];
    setCustomers(mapped2);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Warranty Tracker</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {distinctBrands.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Time Period" />
          </SelectTrigger>
          <SelectContent>
            {TIME_PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-sm">
          {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
        </Badge>
        {brandBreakdown.map(([brand, count]) => (
          <Badge
            key={brand}
            variant="outline"
            className="cursor-pointer hover:bg-accent"
            onClick={() => setBrandFilter(brandFilter === brand ? "all" : brand)}
          >
            {brand} {count}
          </Badge>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">No customers match these filters.</p>
      ) : (
        <div className="grid gap-3">
          {/* Select All toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              disabled={sending}
            />
            <span className="text-sm text-muted-foreground cursor-pointer" onClick={toggleAll}>
              {allSelected ? "Deselect All" : "Select All"}
            </span>
          </div>

          {filtered.map((c) => {
            const lastReminder = c.warranty_reminder_log.length > 0
              ? c.warranty_reminder_log[c.warranty_reminder_log.length - 1]
              : null;
            const isChecked = selected.has(c.id);

            return (
              <Card
                key={c.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${isChecked ? "ring-2 ring-primary" : ""}`}
                onClick={() => navigate(`/warranty/${c.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelect(c.id)}
                      disabled={sending}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{c.name}</p>
                          <Badge className={daysLeftBg(c.daysLeft) + " text-xs"}>
                            {formatDaysLeft(c.daysLeft)}
                          </Badge>
                          {lastReminder && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              💬 {parseDateSafe(lastReminder.sent_at.split("T")[0]).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{c.address}</p>
                        <p className="text-sm text-muted-foreground">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">{c.brand}</p>
                        <p className="text-xs text-muted-foreground">{c.warrantyYears}yr warranty</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{c.boiler_make_model}</span>
                        <span>Expires {formatDateIE(c.expiryDate)}</span>
                      </div>
                      <Progress value={c.percentUsed} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Installed {formatDateIE(parseDateSafe(c.boiler_installation_date!))}</span>
                        <span>{c.percentUsed}% used</span>
                      </div>
                    </div>

                    {periodFilter === "new_install" && (
                      <Button
                        className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/warranty/${c.id}`);
                        }}
                      >
                        📱 Send Warranty Info
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky action bar */}
      {selected.size > 0 && !sending && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 flex items-center justify-between gap-3 z-50">
          <span className="text-sm font-medium">{selected.size} customer{selected.size !== 1 ? "s" : ""} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowConfirm(true)}
            >
              📱 Send Warranty WhatsApp to {selected.size}
            </Button>
          </div>
        </div>
      )}

      {/* Sending progress bar */}
      {sending && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg p-4 z-50 text-center">
          <div className="animate-spin inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full mr-2 align-middle" />
          <span className="text-sm font-medium">Sending {sendProgress.current} of {sendProgress.total}...</span>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send warranty WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Send warranty WhatsApp to {selected.size} customer{selected.size !== 1 ? "s" : ""}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-green-600 hover:bg-green-700 text-white" onClick={handleBulkSend}>
              Send to {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom padding when sticky bar is visible */}
      {(selected.size > 0 || sending) && <div className="h-20" />}
    </div>
  );
};

export default WarrantyTracker;
