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
import { Shield, ArrowUpDown, X, MessageSquare, CalendarPlus, Phone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  renewal_stage: string;
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

function daysLeftBadgeStyle(days: number): string {
  if (days < 0) return "bg-destructive/10 text-destructive border-destructive/20";
  if (days <= 90) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-green-100 text-green-700 border-green-200";
}

function progressColor(days: number): string {
  if (days < 0) return "[&>div]:bg-destructive";
  if (days <= 90) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-primary";
}

function resolveWarrantyYears(makeModel: string, brands: BoilerBrand[]): { brand: string; warrantyYears: number } {
  const mm = makeModel.trim().toLowerCase();
  const modelRows = brands.filter((b) => !b.is_default && b.model_name);
  for (const row of modelRows) {
    const fullName = `${row.brand_name} ${row.model_name}`.toLowerCase();
    if (mm.includes(fullName) || mm.startsWith(fullName)) {
      return { brand: row.brand_name, warrantyYears: row.warranty_years };
    }
  }
  const defaultRows = brands.filter((b) => b.is_default);
  defaultRows.sort((a, b) => b.brand_name.length - a.brand_name.length);
  for (const row of defaultRows) {
    if (mm.startsWith(row.brand_name.toLowerCase()) || mm.includes(row.brand_name.toLowerCase())) {
      return { brand: row.brand_name, warrantyYears: row.warranty_years };
    }
  }
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

type StageTab = "not_contacted" | "reminded" | "signed_up";

const WarrantyTracker = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [brands, setBrands] = useState<BoilerBrand[]>([]);
  const [customers, setCustomers] = useState<CustomerWarranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sortBy, setSortBy] = useState("expiry");
  const [activeTab, setActiveTab] = useState<StageTab>("not_contacted");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");

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
          .select("id, name, phone, address, boiler_make_model, boiler_brand, boiler_model, boiler_installation_date, last_service_date, notes, warranty_reminder_log, renewal_stage")
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
            renewal_stage: c.renewal_stage || "not_contacted",
            brand,
            warrantyYears,
            expiryDate,
            daysLeft,
            percentUsed,
          } as CustomerWarranty;
        })
        .filter(Boolean) as CustomerWarranty[];

      console.log(`Warranty data loaded — ${customersRes.data?.length ?? 0} customers found, ${mapped.length} matched to a brand.`);
      setCustomers(mapped);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Tab counts from all customers (unfiltered)
  const tabCounts = useMemo(() => {
    let notContacted = 0;
    let reminded = 0;
    let signedUp = 0;
    customers.forEach((c) => {
      const stage = (c.renewal_stage || "not_contacted").toLowerCase().replace(/\s+/g, "_");
      if (stage === "not_contacted") notContacted++;
      else if (stage === "reminded") reminded++;
      else signedUp++; // booked_in, confirmed, paid
    });
    return { notContacted, reminded, signedUp };
  }, [customers]);

  // Subtitle stats
  const notContactedCount = tabCounts.notContacted;
  const potential = notContactedCount * 150;

  // Filter by tab first, then by brand/period
  const filtered = useMemo(() => {
    // Stage filter from tab
    let result = customers.filter((c) => {
      const stage = (c.renewal_stage || "not_contacted").toLowerCase().replace(/\s+/g, "_");
      if (activeTab === "not_contacted") return stage === "not_contacted";
      if (activeTab === "reminded") return stage === "reminded";
      return ["booked_in", "confirmed", "paid"].includes(stage);
    });

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
        result = result.filter((c) => c.daysLeft >= 0 && c.daysLeft <= period.maxDays);
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    }

    if (sortBy === "expiry") {
      result.sort((a, b) => a.daysLeft - b.daysLeft);
    } else if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "brand") {
      result.sort((a, b) => a.brand.localeCompare(b.brand) || a.daysLeft - b.daysLeft);
    }

    return result;
  }, [customers, activeTab, brandFilter, periodFilter, sortBy, searchQuery]);

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
        const currentStage = c.renewal_stage || "not_contacted";
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
      return { ...c2, brand: brand2, warrantyYears: warrantyYears2, expiryDate, daysLeft, percentUsed, warranty_reminder_log: reminderLog, renewal_stage: c2.renewal_stage || "not_contacted" } as CustomerWarranty;
    }).filter(Boolean) as CustomerWarranty[];
    setCustomers(mapped2);
    setLoading(false);
  };

  const handleSendSingle = async (c: CustomerWarranty) => {
    const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Office";
    try {
      const { error } = await supabase.functions.invoke("send-warranty-whatsapp", {
        body: { phone: c.phone, message: buildWarrantyMessage(c), customer_id: c.id, customer_name: c.name },
      });
      if (error) throw error;
      const newEntry = { sent_at: new Date().toISOString(), sent_by: displayName };
      const updatedLog = [...c.warranty_reminder_log, newEntry];
      const updates: Record<string, any> = { warranty_reminder_log: updatedLog };
      const currentStage = c.renewal_stage || "not_contacted";
      if ((STAGE_ORDER[currentStage] ?? 0) < (STAGE_ORDER["reminded"] ?? 1)) {
        updates.renewal_stage = "reminded";
      }
      await supabase.from("customers").update(updates as any).eq("id", c.id);
      toast.success(`WhatsApp sent to ${c.name}`);
    } catch {
      toast.error(`Failed to send to ${c.name}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Warranty Tracker</h1>
        </div>
        <Card className="p-8 text-center">
          <p className="text-lg font-medium text-foreground mb-2">No customers found</p>
          <p className="text-sm text-muted-foreground">Make sure customers have a boiler installation date entered.</p>
        </Card>
      </div>
    );
  }

  const tabs: { key: StageTab; label: string; count: number }[] = [
    { key: "not_contacted", label: "Not Contacted", count: tabCounts.notContacted },
    { key: "reminded", label: "Reminded", count: tabCounts.reminded },
    { key: "signed_up", label: "Signed Up", count: tabCounts.signedUp },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Warranty Tracker</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            €{potential.toLocaleString()} potential · {notContactedCount} not yet contacted
          </p>
        </div>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white shrink-0"
          onClick={() => {
            if (filtered.length === 0) return;
            setSelected(new Set(filtered.map((c) => c.id)));
            setShowConfirm(true);
          }}
        >
          Send All ({filtered.length})
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setSelected(new Set()); }}
              className={`pb-2.5 text-sm font-medium transition-colors relative ${
                activeTab === t.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} ({t.count})
              {activeTab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filters — two side by side on mobile, sort dropdown on desktop only */}
      <div className="flex gap-2">
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="flex-1 min-w-0">
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
          <SelectTrigger className="flex-1 min-w-0">
            <SelectValue placeholder="Time Period" />
          </SelectTrigger>
          <SelectContent>
            {TIME_PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="hidden md:inline-flex w-[160px]">
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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search name, phone, address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Select all + count */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            disabled={sending}
          />
          <span className="text-xs text-muted-foreground cursor-pointer" onClick={toggleAll}>
            {allSelected ? "Deselect All" : "Select All"} · {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Customer list */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">No customers match these filters.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const isChecked = selected.has(c.id);
            const boilerDisplay = [c.boiler_brand, c.boiler_model].filter(Boolean).join(" ") || c.boiler_make_model || c.brand;

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
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Top row: name + badge */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{c.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{c.address}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </p>
                      </div>
                      <Badge className={`${daysLeftBadgeStyle(c.daysLeft)} text-xs shrink-0 border`}>
                        {formatDaysLeft(c.daysLeft)}
                      </Badge>
                    </div>

                    {/* Boiler info */}
                    <p className="text-sm text-muted-foreground">{boilerDisplay}</p>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <Progress value={c.percentUsed} className={`h-2 ${progressColor(c.daysLeft)}`} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Expires {formatDateIE(c.expiryDate)}</span>
                        <span>{c.percentUsed}% used</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleSendSingle(c)}
                      >
                        <MessageSquare className="w-4 h-4 mr-1" />
                        Send WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => navigate(`/jobs/new?customer=${c.id}`)}
                      >
                        <CalendarPlus className="w-4 h-4 mr-1" />
                        Book Service
                      </Button>
                    </div>
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

      {(selected.size > 0 || sending) && <div className="h-20" />}
    </div>
  );
};

export default WarrantyTracker;
