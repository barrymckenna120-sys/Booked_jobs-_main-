import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { paidJobsInPeriod, collectedAmount, revenueDate } from "@/lib/financeMetrics";


import DateRangeToggle, { type ViewMode, getDateRange } from "@/components/shared/DateRangeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { BookOpen, CalendarIcon, Download, Loader2, Mail, Search } from "lucide-react";
import OutstandingBalances from "@/components/sales-ledger/OutstandingBalances";
import { format, subMonths } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type LedgerJob = {
  id: string;
  receipt_number: string | null;
  paid_at: string | null;
  completed_at: string | null;
  job_type: string;
  assigned_engineer: string | null;
  payment_method: string | null;
  payment_status: string | null;
  revenue: number | null;
  balance_due: number | null;
  deposit_paid: boolean;
  deposit_amount: number | null;
  customer_name: string;
  invoice_number: string | null;
};

type PaymentBadge = "paid" | "part_paid" | "unpaid";

const getPaymentBadge = (row: LedgerJob): PaymentBadge => {
  if (row.payment_status === "paid" || row.paid_at) return "paid";
  if (row.deposit_paid && (row.balance_due ?? 0) > 0) return "part_paid";
  return "unpaid";
};

const badgeConfig: Record<PaymentBadge, { label: string; bg: string; color: string; border: string }> = {
  paid: { label: "Paid", bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
  part_paid: { label: "Part Paid", bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
  unpaid: { label: "Unpaid", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
};

const eur = (n: number) => `€${n.toFixed(2)}`;

const SalesLedger = () => {
  const { user } = useAuth();
  const { orgId } = useOrgId();

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [search, setSearch] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [engineerFilter, setEngineerFilter] = useState("all");
  const [engineers, setEngineers] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<LedgerJob[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end } = getDateRange(viewMode, anchor);

  useEffect(() => {
    if (!user || !orgId) return;
    supabase
      .from("engineers")
      .select("id, name")
      .eq("organisation_id", orgId)
      .eq("status", "active")
      .then(({ data }) => {
        if (data) setEngineers(data);
      });
  }, [user, orgId]);


  useEffect(() => {
    if (!user || !orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const startStr = format(start, "yyyy-MM-dd");
    const endStr = format(end, "yyyy-MM-dd");

    supabase
      .from("service_calls")
      .select("id, receipt_number, paid_at, completed_at, scheduled_date, status, job_type, assigned_engineer, payment_method, payment_status, revenue, balance_due, deposit_paid, deposit_amount, invoice_number, customer_id, customers(name)")
      .eq("organisation_id", orgId)
      .or(
        `and(paid_at.gte.${startStr}T00:00:00,paid_at.lte.${endStr}T23:59:59),` +
        `and(completed_at.gte.${startStr}T00:00:00,completed_at.lte.${endStr}T23:59:59)`,
      )
      .then(({ data: rows, error }) => {
        if (error) {
          console.error("SalesLedger query failed:", error);
          setLoading(false);
          return;
        }
        if (rows) {
          // Cash basis, same helpers as Finance: the ledger lists money taken,
          // whatever the job status (SumUp payments land on Pending jobs).
          const paid = paidJobsInPeriod(rows as any, new Date(startStr + "T00:00:00"), new Date(endStr + "T23:59:59")).sort(
            (a, b) => (revenueDate(b)?.getTime() || 0) - (revenueDate(a)?.getTime() || 0),
          );
          setData(
            paid.map((r: any) => ({
              id: r.id,
              receipt_number: r.receipt_number,
              paid_at: r.paid_at,
              completed_at: r.completed_at,
              job_type: r.job_type,
              assigned_engineer: r.assigned_engineer,
              payment_method: r.payment_method,
              payment_status: r.payment_status,
              revenue: collectedAmount(r),
              balance_due: r.balance_due,
              deposit_paid: r.deposit_paid,
              deposit_amount: r.deposit_amount,
              customer_name: r.customers?.name || "Unknown",
              invoice_number: r.invoice_number,
            }))
          );
        }
        setLoading(false);
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, orgId, start.getTime(), end.getTime()]);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (search && !row.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (jobTypeFilter !== "all" && row.job_type !== jobTypeFilter) return false;
      if (paymentFilter !== "all" && row.payment_method !== paymentFilter) return false;
      if (engineerFilter !== "all" && row.assigned_engineer !== engineerFilter) return false;
      if (statusFilter !== "all") {
        const badge = getPaymentBadge(row);
        if (statusFilter !== badge) return false;
      }
      return true;
    });
  }, [data, search, jobTypeFilter, paymentFilter, engineerFilter, statusFilter]);

  const totals = useMemo(() => {
    let totalInc = 0;
    let totalNet = 0;
    let totalVat = 0;
    for (const row of filtered) {
      const rev = row.revenue || 0;
      const net = Math.round((rev / 1.135) * 100) / 100;
      const vat = Math.round((rev - net) * 100) / 100;
      totalInc += rev;
      totalNet += net;
      totalVat += vat;
    }
    return {
      inc: Math.round(totalInc * 100) / 100,
      net: Math.round(totalNet * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
    };
  }, [filtered]);

  const buildCsvContent = (rows: LedgerJob[]) => {
    const headers = ["Receipt No", "Invoice No", "Date", "Customer", "Job Type", "Engineer", "Payment Method", "Status", "Total inc VAT", "Net", "VAT"];
    let totalInc = 0, totalNet = 0, totalVat = 0;
    const csvRows = rows.map((r) => {
      const rev = r.revenue || 0;
      const net = Math.round((rev / 1.135) * 100) / 100;
      const vat = Math.round((rev - net) * 100) / 100;
      totalInc += rev; totalNet += net; totalVat += vat;
      const badge = getPaymentBadge(r);
      return [
        r.receipt_number || "",
        r.invoice_number || "",
        revenueDate(r as any) ? format(revenueDate(r as any)!, "dd/MM/yy") : "",
        r.customer_name, r.job_type, r.assigned_engineer || "",
        r.payment_method || "", badgeConfig[badge].label,
        rev.toFixed(2), net.toFixed(2), vat.toFixed(2),
      ];
    });
    csvRows.push(["", "", "", "", "", "", "", "TOTALS", totalInc.toFixed(2), totalNet.toFixed(2), totalVat.toFixed(2)]);
    return [headers, ...csvRows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  };

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    downloadCsv(buildCsvContent(filtered), `sales-ledger-${format(start, "yyyy-MM-dd")}.csv`);
  };

  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [customExporting, setCustomExporting] = useState(false);

  const exportCustomRange = async () => {
    if (!customStart || !customEnd || !user || !orgId) return;
    setCustomExporting(true);
    const startStr = format(customStart, "yyyy-MM-dd");
    const endStr = format(customEnd, "yyyy-MM-dd");
    const { data: rows } = await supabase
      .from("service_calls")
      .select("id, receipt_number, paid_at, completed_at, scheduled_date, status, job_type, assigned_engineer, payment_method, payment_status, revenue, balance_due, deposit_paid, deposit_amount, invoice_number, customer_id, customers(name)")
      .eq("organisation_id", orgId)
      .or(
        `and(paid_at.gte.${startStr}T00:00:00,paid_at.lte.${endStr}T23:59:59),` +
        `and(completed_at.gte.${startStr}T00:00:00,completed_at.lte.${endStr}T23:59:59)`,
      );
    setCustomExporting(false);
    if (!rows || rows.length === 0) return;
    const paid = paidJobsInPeriod(rows as any, new Date(startStr + "T00:00:00"), new Date(endStr + "T23:59:59")).sort(
      (a, b) => (revenueDate(b)?.getTime() || 0) - (revenueDate(a)?.getTime() || 0),
    );
    if (paid.length === 0) return;
    const mapped = paid.map((r: any) => ({
      id: r.id, receipt_number: r.receipt_number, paid_at: r.paid_at,
      completed_at: r.completed_at,
      job_type: r.job_type, assigned_engineer: r.assigned_engineer,
      payment_method: r.payment_method, payment_status: r.payment_status,
      revenue: collectedAmount(r), balance_due: r.balance_due,
      deposit_paid: r.deposit_paid, deposit_amount: r.deposit_amount,
      customer_name: r.customers?.name || "Unknown",
      invoice_number: r.invoice_number,
    }));

    downloadCsv(buildCsvContent(mapped), `sales-ledger-${startStr}-to-${endStr}.csv`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-black tracking-tight">Sales</h1>
        </div>
        <DateRangeToggle
          value={viewMode}
          onChange={setViewMode}
          anchor={anchor}
          onAnchorChange={setAnchor}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Job Types</SelectItem>
            <SelectItem value="Boiler Service">Boiler Service</SelectItem>
            <SelectItem value="Emergency">Emergency</SelectItem>
            <SelectItem value="Repair">Repair</SelectItem>
            <SelectItem value="Quote">Quote</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Payment Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="part_paid">Part Paid</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={engineerFilter} onValueChange={setEngineerFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Engineer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Engineers</SelectItem>
            {engineers.map((e) => (
              <SelectItem key={e.id} value={e.name}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Outstanding Balances */}
      <OutstandingBalances />

      {/* Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
          <CardTitle className="text-lg font-extrabold">Sales</CardTitle>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 font-bold text-xs">
                  <CalendarIcon className="w-4 h-4" /> Custom Export
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-bold">Export Custom Date Range</p>
                  <div className="flex gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">From</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left text-xs font-normal", !customStart && "text-muted-foreground")}>
                            {customStart ? format(customStart, "dd/MM/yyyy") : "Start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">To</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left text-xs font-normal", !customEnd && "text-muted-foreground")}>
                            {customEnd ? format(customEnd, "dd/MM/yyyy") : "End date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1.5 font-bold"
                    onClick={exportCustomRange}
                    disabled={!customStart || !customEnd || customExporting}
                  >
                    {customExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export Range
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <AccountantExportButton />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-16 text-sm">
              No completed jobs for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-extrabold">Receipt No</TableHead>
                    <TableHead className="font-extrabold">Invoice No</TableHead>
                    <TableHead className="font-extrabold">Date</TableHead>
                    <TableHead className="font-extrabold">Customer</TableHead>
                    <TableHead className="font-extrabold">Job Type</TableHead>
                    <TableHead className="font-extrabold">Engineer</TableHead>
                    <TableHead className="font-extrabold">Payment</TableHead>
                    <TableHead className="font-extrabold text-right">Total inc VAT</TableHead>
                    <TableHead className="font-extrabold text-right">Net</TableHead>
                    <TableHead className="font-extrabold text-right">VAT (13.5%)</TableHead>
                    <TableHead className="font-extrabold text-center">Status</TableHead>
                    <TableHead className="font-extrabold text-center w-[80px]">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const rev = row.revenue || 0;
                    const net = Math.round((rev / 1.135) * 100) / 100;
                    const vat = Math.round((rev - net) * 100) / 100;
                    const badge = getPaymentBadge(row);
                    const cfg = badgeConfig[badge];
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono font-bold">
                          {row.receipt_number ? (
                            <a href={`/jobs/${row.id}`} className="text-primary hover:underline">{row.receipt_number}</a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.invoice_number || "—"}</TableCell>
                        <TableCell>{revenueDate(row as any) ? format(revenueDate(row as any)!, "dd/MM/yy") : "—"}</TableCell>
                        <TableCell className="font-semibold">{row.customer_name}</TableCell>
                        <TableCell>{row.job_type}</TableCell>
                        <TableCell>{row.assigned_engineer || "—"}</TableCell>
                        <TableCell className="capitalize">{row.payment_method || "—"}</TableCell>
                        <TableCell className="text-right font-bold">{eur(rev)}</TableCell>
                        <TableCell className="text-right">{eur(net)}</TableCell>
                        <TableCell className="text-right">{eur(vat)}</TableCell>
                        <TableCell className="text-center">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                          >
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {row.receipt_number ? (
                            <a
                              href={`/receipt-view/${row.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs font-semibold"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50 font-extrabold">
                    <TableCell colSpan={7} className="text-right">TOTALS</TableCell>
                    <TableCell className="text-right">{eur(totals.inc)}</TableCell>
                    <TableCell className="text-right">{eur(totals.net)}</TableCell>
                    <TableCell className="text-right">{eur(totals.vat)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function AccountantExportButton() {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const prev = subMonths(new Date(), 1);
  const [month, setMonth] = useState(format(prev, "yyyy-MM"));

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-accountant-export", {
        body: { month },
      });
      if (error) throw error;
      if (data?.success) {
        const [y, m] = month.split("-");
        const label = format(new Date(Number(y), Number(m) - 1), "MMMM yyyy");
        toast.success(`Export for ${label} sent to accountant.`);
        setOpen(false);
      } else {
        throw new Error("unexpected response");
      }
    } catch {
      toast.error("Export failed — please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 font-bold" onClick={() => setOpen(true)}>
        <Mail className="w-4 h-4" /> Email to Accountant
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Email Export to Accountant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium text-foreground">Month</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleSend} disabled={sending} className="w-full">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Send Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SalesLedger;
