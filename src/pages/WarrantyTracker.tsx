import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Search, ChevronLeft, ChevronRight, Database } from "lucide-react";

const PAGE_SIZE = 20;

type StatusFilter = "all" | "under_warranty" | "expiring_soon" | "expired" | "no_data";

interface CustomerRow {
  id: string;
  name: string;
  boiler_brand: string | null;
  boiler_model: string | null;
  boiler_installation_date: string | null;
  warranty_years: number | null;
}

function calcExpiry(installDate: string | null, warrantyYears: number | null): Date | null {
  if (!installDate || !warrantyYears) return null;
  const d = new Date(installDate + "T12:00:00");
  d.setFullYear(d.getFullYear() + warrantyYears);
  return d;
}

function calcStatus(installDate: string | null, warrantyYears: number | null): "under_warranty" | "expiring_soon" | "expired" | "no_data" {
  const expiry = calcExpiry(installDate, warrantyYears);
  if (!expiry) return "no_data";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (expiry < now) return "expired";
  const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 90) return "expiring_soon";
  return "under_warranty";
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

const WarrantyTracker = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("customers")
        .select("id, name, boiler_brand, boiler_model, boiler_installation_date, warranty_years")
        .order("name");
      if (data) {
        // Only keep customers with some boiler data
        setCustomers(data.filter((c: any) => c.boiler_brand || c.boiler_installation_date));
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  // Summary counts
  const summary = useMemo(() => {
    let total = 0, underWarranty = 0, expiringSoon = 0, outOfWarranty = 0;
    customers.forEach((c) => {
      total++;
      const s = calcStatus(c.boiler_installation_date, c.warranty_years);
      if (s === "under_warranty") underWarranty++;
      else if (s === "expiring_soon") expiringSoon++;
      else if (s === "expired") outOfWarranty++;
    });
    return { total, underWarranty, expiringSoon, outOfWarranty };
  }, [customers]);

  // Brand/model breakdown
  const brandBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    customers.forEach((c) => {
      const brand = c.boiler_brand || "Unknown";
      const model = c.boiler_model || "Unknown";
      if (!map[brand]) map[brand] = {};
      map[brand][model] = (map[brand][model] || 0) + 1;
    });
    return Object.entries(map)
      .map(([brand, models]) => ({
        brand,
        models: Object.entries(models).sort((a, b) => b[1] - a[1]),
        total: Object.values(models).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [customers]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter((c) => {
      const matchesSearch = !q || c.name?.toLowerCase().includes(q) || c.boiler_model?.toLowerCase().includes(q) || c.boiler_brand?.toLowerCase().includes(q);
      const s = calcStatus(c.boiler_installation_date, c.warranty_years);
      const matchesStatus = statusFilter === "all" || s === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusBadge = (c: CustomerRow) => {
    const s = calcStatus(c.boiler_installation_date, c.warranty_years);
    switch (s) {
      case "under_warranty":
        return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-semibold"><ShieldCheck className="w-3 h-3" /> Under Warranty</span>;
      case "expiring_soon":
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-semibold"><ShieldAlert className="w-3 h-3" /> Expiring Soon</span>;
      case "expired":
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-semibold"><ShieldX className="w-3 h-3" /> Expired</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-semibold">No Data</span>;
    }
  };

  const summaryCards = [
    { label: "Total with Boiler Data", value: summary.total, icon: Database, color: "text-primary" },
    { label: "Under Warranty", value: summary.underWarranty, icon: ShieldCheck, color: "text-green-600" },
    { label: "Expiring in 90 Days", value: summary.expiringSoon, icon: ShieldAlert, color: "text-amber-600" },
    { label: "Out of Warranty", value: summary.outOfWarranty, icon: ShieldX, color: "text-red-600" },
  ];

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Under Warranty", value: "under_warranty" },
    { label: "Expiring Soon", value: "expiring_soon" },
    { label: "Expired", value: "expired" },
    { label: "No Data", value: "no_data" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-extrabold">Warranty Tracker</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="shadow-sm border-border/60">
            <CardContent className="p-5 flex items-center gap-4">
              <card.icon className={`w-8 h-8 ${card.color}`} />
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Brand & Model Breakdown */}
      {brandBreakdown.length > 0 && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-6">
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide mb-4">Boiler Brand & Model Breakdown</p>
            <div className="space-y-4">
              {brandBreakdown.map(({ brand, models }) => (
                <div key={brand}>
                  <p className="text-sm font-bold mb-1">{brand}</p>
                  <div className="flex flex-wrap gap-2">
                    {models.map(([model, count]) => (
                      <button
                        key={model}
                        onClick={() => setSearch(model === "Unknown" ? "" : model)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        {model} <span className="font-extrabold">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Status Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by customer name or boiler model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((fb) => (
            <Button
              key={fb.value}
              variant={statusFilter === fb.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(fb.value)}
            >
              {fb.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      <Card className="shadow-sm border-border/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : paginated.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No customers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead className="text-xs uppercase font-semibold">Name</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Brand</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Model</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Install Date</TableHead>
                    <TableHead className="hidden lg:table-cell text-xs uppercase font-semibold">Warranty Expiry</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => {
                    const expiry = calcExpiry(c.boiler_installation_date, c.warranty_years);
                    const installDate = c.boiler_installation_date ? new Date(c.boiler_installation_date + "T12:00:00") : null;
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-primary-light transition-colors"
                        onClick={() => navigate(`/customers/${c.id}`)}
                      >
                        <TableCell className="font-semibold">{c.name}</TableCell>
                        <TableCell>{c.boiler_brand || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.boiler_model || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(installDate)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatDate(expiry)}</TableCell>
                        <TableCell>{statusBadge(c)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WarrantyTracker;
