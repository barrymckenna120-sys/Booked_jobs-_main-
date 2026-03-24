import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ClipboardList, Search, ArrowUpDown, ArrowUp, ArrowDown, Banknote, CreditCard, FileText, Receipt, CheckCircle2, CalendarPlus, Eye, AlertCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import TakePaymentModal from "@/components/payments/TakePaymentModal";

const PAGE_SIZE = 15;

type Job = {
  id: string;
  customer_id: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  has_quote: boolean;
  payment_method: string | null;
  receipt_number: string | null;
  receipt_sent: boolean;
  revenue: number | null;
  user_id: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  customer_name?: string;
  follow_up_needed?: boolean;
  follow_up_detail?: string | null;
};

const Jobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentJob, setPaymentJob] = useState<{ job: any; customer: any } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState(searchParams.get("payment") || "all");
  const [page, setPage] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [sortCol, setSortCol] = useState<"customer_name" | "scheduled_date" | "status">("scheduled_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quotesMap, setQuotesMap] = useState<Record<string, any>>({});
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (user) fetchJobs();
  }, [user]);

  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, search, paymentFilter]);

  const fetchJobs = async () => {
    setLoading(true);
    const { data: jobsData } = await supabase
      .from("service_calls")
      .select("*")
      .order("scheduled_date", { ascending: false });

    if (jobsData) {
      const customerIds = [...new Set(jobsData.map(j => j.customer_id))];
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone, address, eircode")
        .in("id", customerIds);
      const cMap: Record<string, any> = {};
      (customers || []).forEach(c => { cMap[c.id] = c; });
      setCustomersMap(cMap);

      // Fetch quotes linked to incoming jobs
      const incomingJobIds = jobsData.filter(j => j.status === "incoming").map(j => j.id);
      if (incomingJobIds.length > 0) {
        const { data: quotes } = await supabase
          .from("quotes")
          .select("id, quote_number, converted_job_id, accepted_at, total_amount")
          .in("converted_job_id", incomingJobIds);
        const qMap: Record<string, any> = {};
        (quotes || []).forEach(q => { if (q.converted_job_id) qMap[q.converted_job_id] = q; });
        setQuotesMap(qMap);
      }

      setJobs(jobsData.map(j => ({ ...j, customer_name: cMap[j.customer_id]?.name || "Unknown" })) as Job[]);
    }
    setLoading(false);
  };

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "customer_name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5 ml-1" /> : <ArrowDown className="w-3.5 h-3.5 ml-1" />;
  };

  const INCOMPLETE_STATUSES = ["Pending", "Scheduled", "Booked", "En Route", "On Site", "In Progress", "no_show", "parts_needed"];

  // Separate incoming jobs from the rest
  const incomingJobs = jobs.filter(j => j.status === "incoming");
  const nonIncomingJobs = jobs.filter(j => j.status !== "incoming");

  const filtered = nonIncomingJobs
    .filter(j => {
      let matchStatus: boolean;
      if (statusFilter === "all") {
        matchStatus = true;
      } else if (statusFilter === "incomplete,cancelled") {
        matchStatus = INCOMPLETE_STATUSES.includes(j.status) || j.status === "Cancelled";
      } else if (statusFilter === "incomplete") {
        matchStatus = INCOMPLETE_STATUSES.includes(j.status);
      } else {
        matchStatus = j.status === statusFilter;
      }
      const matchType = typeFilter === "all" || j.job_type === typeFilter;
      const matchSearch = !search || (j.customer_name || "").toLowerCase().includes(search.toLowerCase());
      const matchPayment = paymentFilter === "all" || (paymentFilter === "unpaid" ? !j.payment_method : j.payment_method === paymentFilter);
      return matchStatus && matchType && matchSearch && matchPayment;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "customer_name") return dir * (a.customer_name || "").localeCompare(b.customer_name || "");
      if (sortCol === "status") return dir * a.status.localeCompare(b.status);
      const da = a.scheduled_date || "";
      const db = b.scheduled_date || "";
      return dir * da.localeCompare(db);
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const jobTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      "Boiler Service": "bg-primary/10 text-primary",
      "Repair": "bg-warning/10 text-warning",
      "Emergency": "bg-destructive/10 text-destructive",
    };
    return <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${styles[type] || "bg-muted text-muted-foreground"}`}>{type}</span>;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Pending: "badge-due-soon",
      Scheduled: "badge-scheduled",
      Booked: "badge-scheduled",
      "En Route": "badge-due-soon",
      "On Site": "badge-due-soon",
      "In Progress": "badge-due-soon",
      Completed: "badge-up-to-date",
      Cancelled: "badge-overdue",
      "Awaiting Deposit": "badge-due-soon",
      no_show: "badge-overdue",
      parts_needed: "badge-due-soon",
      incoming: "badge-due-soon",
    };
    const label = status === "no_show" ? "No Show" : status === "parts_needed" ? "Parts Needed" : status === "incoming" ? "Incoming" : status === "Pending" ? "Pending" : status;
    return <span className={styles[status] || "badge-scheduled"}>{label}</span>;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-extrabold">All Jobs</h1>

      {/* ── INCOMING JOBS SECTION ── */}
      {incomingJobs.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold text-foreground">
                Incoming Jobs
              </h2>
              <span className="inline-flex items-center justify-center text-xs font-bold rounded-full px-2.5 py-0.5 bg-amber-500 text-white min-w-[24px]">
                {incomingJobs.length}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {incomingJobs.map((j) => {
                const quote = quotesMap[j.id];
                return (
                  <div
                    key={j.id}
                    className="rounded-lg border border-amber-200 bg-white p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-foreground">{j.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{j.job_type}</p>
                      </div>
                      {j.revenue != null && j.revenue > 0 && (
                        <span className="text-sm font-bold text-foreground">{eur(j.revenue)}</span>
                      )}
                    </div>

                    {quote && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>From Quote <span className="font-semibold text-primary">{quote.quote_number}</span></p>
                        {quote.accepted_at && (
                          <p>Accepted {fmtDate(quote.accepted_at)}</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-xs font-bold gap-1 bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/jobs/${j.id}`);
                        }}
                      >
                        <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                      </Button>
                      {quote && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-bold gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/quotes/${quote.id}`);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> View Quote
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-bold gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/jobs/${j.id}`);
                        }}
                      >
                        View Job
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── FILTERS ── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="incomplete,cancelled">Incomplete & Cancelled</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Booked">Booked</SelectItem>
            <SelectItem value="En Route">En Route</SelectItem>
            <SelectItem value="On Site">On Site</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="Awaiting Deposit">Awaiting Deposit</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
            <SelectItem value="parts_needed">Parts Needed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Boiler Service">Boiler Service</SelectItem>
            <SelectItem value="Boiler Replacement">Boiler Replacement</SelectItem>
            <SelectItem value="Boiler Installation">Boiler Installation</SelectItem>
            <SelectItem value="Repair">Repair</SelectItem>
            <SelectItem value="Emergency">Emergency</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── JOBS TABLE ── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : paginated.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No jobs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("customer_name")}>
                      <span className="inline-flex items-center">Customer <SortIcon col="customer_name" /></span>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("scheduled_date")}>
                      <span className="inline-flex items-center">Date <SortIcon col="scheduled_date" /></span>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Engineer</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      <span className="inline-flex items-center">Status <SortIcon col="status" /></span>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead className="hidden md:table-cell">Quote</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="w-[100px]">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((j) => {
                    const canTakePayment = ["Completed", "In Progress"].includes(j.status);
                    const hasReceipt = !!j.receipt_number;
                    return (
                    <TableRow key={j.id} className="cursor-pointer hover:bg-primary-light" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <TableCell>
                        <span className="font-semibold">{j.customer_name}</span>
                        {j.follow_up_needed && (
                          <div className="mt-1 space-y-0.5">
                            <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">Follow-up</span>
                            {j.follow_up_detail && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{j.follow_up_detail}</p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{jobTypeBadge(j.job_type)}</TableCell>
                      <TableCell>
                        {j.scheduled_date
                          ? `${new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-GB")}${j.time_block ? ` · ${j.time_block}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{j.assigned_engineer || "—"}</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {j.source === "Quote" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary"><ClipboardList className="w-3 h-3" />Quote</span>
                        ) : j.source === "Tally" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600">Tally</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{j.has_quote ? <ClipboardList className="w-4 h-4 text-primary" /> : "—"}</TableCell>
                      <TableCell>
                        {j.payment_method === "cash" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600"><Banknote className="w-3.5 h-3.5" />Cash</span>
                        ) : j.payment_method === "card" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600"><CreditCard className="w-3.5 h-3.5" />Card</span>
                        ) : j.payment_method === "invoice" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600"><FileText className="w-3.5 h-3.5" />Invoice</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {hasReceipt ? (
                          <button
                            onClick={() => navigate(`/receipt/${j.id}`)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                          >
                            <Receipt className="w-3.5 h-3.5" /> {j.receipt_number}
                            {j.receipt_sent && <CheckCircle2 className="w-3.5 h-3.5 text-success ml-0.5" />}
                          </button>
                        ) : canTakePayment ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-bold gap-1"
                            onClick={() => {
                              const cust = customersMap[j.customer_id];
                              if (!cust) { toast({ title: "Customer data not loaded" }); return; }
                              setPaymentJob({ job: j, customer: cust });
                            }}
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Take Payment
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Take Payment Modal */}
      {paymentJob && (
        <TakePaymentModal
          open={!!paymentJob}
          onClose={() => setPaymentJob(null)}
          job={paymentJob.job}
          customer={paymentJob.customer}
          onPaymentComplete={() => fetchJobs()}
        />
      )}

    </div>
  );
};

export default Jobs;
