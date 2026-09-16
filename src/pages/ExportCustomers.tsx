import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import {
  EXPORT_COLUMNS,
  buildExportRows,
  formatAreaCodeForExport,
  formatDateForExport,
  formatEircodeForExport,
  formatPhoneForExport,
  formatRenewalStageForExport,
  formatServiceStatusForExport,
} from "@/lib/customerExportFormat";
import { exportCustomersToExcel } from "@/lib/customerExportWorkbook";

const PAGE_SIZE = 25;

const SERVICE_STATUSES = ["Up to Date", "Due Soon", "Overdue", "Serviced"];
const RENEWAL_STAGES = [
  { value: "not_contacted", label: "Not Contacted" },
  { value: "reminded", label: "Reminded" },
  { value: "confirmed", label: "Confirmed" },
  { value: "booked", label: "Booked In" },
  { value: "paid", label: "Paid" },
];

/** Search matches name, mobile, address, Eircode and GPRN. */
export const matchesSearch = (c: any, term: string): boolean => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const haystack = [c.name, c.address, c.eircode, c.gprn]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  if (haystack.includes(q)) return true;
  if (digits.length >= 3) {
    const phone = String(c.phone ?? "").replace(/\D/g, "");
    if (phone.includes(digits)) return true;
  }
  return false;
};

export const filterCustomers = (
  customers: any[],
  opts: { search: string; status: string; stage: string; area: string },
): any[] =>
  customers.filter((c) => {
    if (!matchesSearch(c, opts.search)) return false;
    if (opts.status !== "all" && formatServiceStatusForExport(c.service_status) !== opts.status) return false;
    if (opts.stage !== "all" && (c.renewal_stage || "not_contacted") !== opts.stage) return false;
    if (opts.area !== "all" && formatAreaCodeForExport(c.area_code) !== opts.area) return false;
    return true;
  });

/** Selected ids are only ever honoured when present in the org-scoped set. */
export const resolveSelectedCustomers = (customers: any[], selected: Set<string>): any[] =>
  customers.filter((c) => selected.has(c.id));

const ExportCustomers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId, ready } = useOrgId();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [area, setArea] = useState("all");
  const [page, setPage] = useState(0);
  const [step, setStep] = useState<"select" | "preview">("select");

  useEffect(() => {
    if (!user || !ready || !orgId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("customers")
      .select("*")
      .eq("organisation_id", orgId)
      .eq("is_archived", false)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else {
          setCustomers(data || []);
          setSelected(new Set((data || []).map((c: any) => c.id)));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, ready, orgId]);

  const areaCodes = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      const v = formatAreaCodeForExport(c.area_code);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [customers]);

  const filtered = useMemo(
    () => filterCustomers(customers, { search, status, stage, area }),
    [customers, search, status, stage, area],
  );

  useEffect(() => { setPage(0); }, [search, status, stage, area]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const selectedCustomers = useMemo(
    () => resolveSelectedCustomers(customers, selected),
    [customers, selected],
  );
  const selectedCount = selectedCustomers.length;
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const previewRows = useMemo(() => buildExportRows(selectedCustomers), [selectedCustomers]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });

  const activeFilters = [
    search.trim() ? `search "${search.trim()}"` : null,
    status !== "all" ? `status ${status}` : null,
    stage !== "all" ? `renewal ${RENEWAL_STAGES.find((s) => s.value === stage)?.label}` : null,
    area !== "all" ? `area ${area}` : null,
  ].filter(Boolean) as string[];

  const handleExport = () => {
    if (previewRows.length === 0) return;
    exportCustomersToExcel(previewRows);
    toast({ title: "Export complete", description: `${previewRows.length} customers exported.` });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <button
        onClick={() => (step === "preview" ? setStep("select") : navigate("/settings"))}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> {step === "preview" ? "Back to Selection" : "Back to Settings"}
      </button>

      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Export Customers</h1>
        <p className="text-sm text-muted-foreground">
          {step === "select"
            ? "Choose the customers to include, then preview exactly what will be exported."
            : "This is exactly what the Excel file will contain."}
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load your customers: {loadError}
        </div>
      )}

      {customers.length === 0 && !loadError && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          There are no customers to export yet.
        </div>
      )}

      {step === "select" && customers.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">{customers.length} customers</Badge>
            <Badge variant="secondary" className="font-normal">{selectedCount} selected</Badge>
            {filtered.length !== customers.length && (
              <Badge variant="outline" className="font-normal">{filtered.length} shown</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {activeFilters.length ? `Filters: ${activeFilters.join(" · ")}` : "No filters applied"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Service Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {SERVICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue placeholder="Renewal Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All renewal stages</SelectItem>
                {RENEWAL_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue placeholder="Area Code" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All area codes</SelectItem>
                {areaCodes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
                <span className="text-sm font-medium">
                  Select all {filtered.length} customer{filtered.length === 1 ? "" : "s"}
                  {activeFilters.length ? " matching these filters" : ""}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Mobile Number</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Eircode</TableHead>
                      <TableHead>Area Code</TableHead>
                      <TableHead>Service Status</TableHead>
                      <TableHead>Next Service Due</TableHead>
                      <TableHead>Renewal Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                          No customers match these filters.
                        </TableCell>
                      </TableRow>
                    ) : pageRows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatPhoneForExport(c.phone)}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{c.address}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatEircodeForExport(c.eircode)}</TableCell>
                        <TableCell>{formatAreaCodeForExport(c.area_code)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatServiceStatusForExport(c.service_status)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateForExport(c.next_service_due)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatRenewalStageForExport(c.renewal_stage)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedCount} of {customers.length} customers selected
            </span>
            <Button disabled={selectedCount === 0} onClick={() => setStep("preview")}>
              Preview Export →
            </Button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {selectedCount} customer{selectedCount === 1 ? "" : "s"} selected for export
            </Badge>
            {activeFilters.length > 0 && (
              <span className="text-xs text-muted-foreground">Filters: {activeFilters.join(" · ")}</span>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {EXPORT_COLUMNS.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {EXPORT_COLUMNS.map((h) => (
                          <TableCell key={h} className="whitespace-nowrap max-w-[240px] truncate">
                            {row[h]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep("select")}>
              ← Back to Selection
            </Button>
            <Button disabled={selectedCount === 0} onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              {selectedCount === customers.length
                ? `Export All ${selectedCount} Customers to Excel`
                : `Export ${selectedCount} Customer${selectedCount === 1 ? "" : "s"} to Excel`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExportCustomers;
