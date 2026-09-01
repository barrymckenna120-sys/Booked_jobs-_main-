import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ClipboardList, Search, ArrowUpDown, ArrowUp, ArrowDown, Banknote, CreditCard, FileText, Receipt, CheckCircle2, ChevronDown, Phone, MessageCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import TakePaymentModal from "@/components/payments/TakePaymentModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractRefDigits, matchesJobRef } from "@/lib/jobRefSearch";
import JobConfirmedBadge from "@/components/jobs/JobConfirmedBadge";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";
import { formatWhatsApp } from "@/lib/whatsappLink";
import { withRequestTimeout, queryRetryDelay } from "@/lib/queryDefaults";


const PAGE_SIZE = 15;
/** Collapse bursts of service_calls events into a single refetch. */
const REALTIME_DEBOUNCE_MS = 1500;
/** Hard cap so a failing connection can't loop the three list queries forever. */
const MAX_FETCH_RETRIES = 2;


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
  payment_status: string | null;
  receipt_number: string | null;
  receipt_sent: boolean;
  revenue: number | null;
  user_id: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  follow_up_needed?: boolean;
  follow_up_detail?: string | null;
  follow_up_resolved?: boolean;
  job_reference?: string | null;
  confirmed?: boolean | null;
  confirmed_at?: string | null;
  customer_status_at_booking?: string | null;
};

const Jobs = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { ready } = useOrgId();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentJob, setPaymentJob] = useState<{ job: any; customer: any } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [search, setSearch] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState(searchParams.get("payment") || "all");
  const [page, setPage] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [sortCol, setSortCol] = useState<"customer_name" | "scheduled_date" | "status">("scheduled_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [jobQuotesMap, setJobQuotesMap] = useState<Record<string, string>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const realtimeTimer = useRef<number | null>(null);
  const retryCount = useRef(0);



  useEffect(() => {
    if (user && ready) fetchJobs();
  }, [user, ready]);

  // Realtime: auto-refresh when any service_call changes.
  // Debounced: a bulk update (or a burst of engineer status changes) used to
  // fire one full three-query refetch per event, which on a weak connection
  // multiplies into hundreds of requests.
  useEffect(() => {
    if (!user || !ready) return;
    const channel = supabase
      .channel("jobs-list-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_calls" }, () => {
        if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
        realtimeTimer.current = window.setTimeout(() => {
          realtimeTimer.current = null;
          fetchJobs();
        }, REALTIME_DEBOUNCE_MS);
      })
      .subscribe();
    return () => {
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
      supabase.removeChannel(channel);
    };
  }, [user, ready]);

  useEffect(() => { setPage(0); setCompletedPage(0); }, [statusFilter, typeFilter, search, paymentFilter, refSearch]);

  const fetchJobs = async () => {
    setLoading(true);
    setLoadFailed(false);
    const CACHE_KEY = "bookedjobs_jobs_cache";
    const isAdminViewing = !!localStorage.getItem("adminViewingOrgId");

    // Only read cache for regular users. Admins viewing another org must
    // wait for a fresh fetch to avoid showing the previous tenant's data.
    if (!isAdminViewing) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setJobs(parsed.jobs || []);
          setCustomersMap(parsed.customersMap || {});
          setLoading(false);
        }
      } catch (e) {}
    }

    try {
      const { data: jobsData } = await withRequestTimeout(
        supabase
          .from("service_calls")
          .select("*")
          .order("scheduled_date", { ascending: false })
      );

      if (jobsData) {
        retryCount.current = 0;
        const customerIds = [...new Set(jobsData.map(j => j.customer_id))] as string[];
        const { data: customers } = await withRequestTimeout(
          supabase
            .from("customers")
            .select("id, name, phone, address, eircode")
            .in("id", customerIds)
        );
        const cMap: Record<string, any> = {};
        (customers || []).forEach(c => { cMap[c.id] = c; });
        setCustomersMap(cMap);

        // Quote lookup: only for jobs that actually have a quote, and scoped to
        // those jobs' ids/customers instead of pulling every non-draft quote.
        const quotedJobs = jobsData.filter(j => j.has_quote);
        if (quotedJobs.length > 0) {
          const quotedJobIds = quotedJobs.map(j => j.id);
          const quotedCustomerIds = [...new Set(quotedJobs.map(j => j.customer_id).filter(Boolean))];
          const orFilters = [
            `converted_job_id.in.(${quotedJobIds.join(",")})`,
            `job_id.in.(${quotedJobIds.join(",")})`,
          ];
          if (quotedCustomerIds.length > 0) {
            orFilters.push(`customer_id.in.(${quotedCustomerIds.join(",")})`);
          }
          const { data: allQuotes } = await withRequestTimeout(
            supabase
              .from("quotes")
              .select("id, quote_number, converted_job_id, accepted_at, total_amount, customer_id, job_id, status, created_at")
              .neq("status", "Draft")
              .or(orFilters.join(","))
              .order("created_at", { ascending: false })
          );

          if (allQuotes) {
            // Lookup by converted_job_id, then job_id, then customer_id
            const jqMap: Record<string, string> = {};
            for (const job of quotedJobs) {
              const match = allQuotes.find(q => q.converted_job_id === job.id)
                || allQuotes.find(q => q.job_id === job.id)
                || allQuotes.find(q => q.customer_id === job.customer_id);
              if (match) jqMap[job.id] = match.id;
            }
            setJobQuotesMap(jqMap);
          }
        } else {
          setJobQuotesMap({});
        }

        const jobs = jobsData.map(j => ({ ...j, customer_name: cMap[j.customer_id]?.name || "Unknown", customer_address: cMap[j.customer_id]?.address || "", customer_phone: cMap[j.customer_id]?.phone || "" })) as Job[];
        setJobs(jobs);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            jobs,
            customersMap: cMap,
            cachedAt: new Date().toISOString()
          }));
        } catch (e) {}
      }
    } catch (error) {
      // Capped retry. The old code retried every 5s forever, so a weak
      // connection turned one failed load into an unbounded request loop.
      if (retryCount.current < MAX_FETCH_RETRIES) {
        const attempt = retryCount.current;
        retryCount.current += 1;
        window.setTimeout(() => fetchJobs(), queryRetryDelay(attempt));
      } else {
        setLoadFailed(true);
      }
    } finally {
      setLoading(false);
    }
  };


  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "customer_name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5 ml-1" /> : <ArrowDown className="w-3.5 h-3.5 ml-1" />;
  };

  const INCOMPLETE_STATUSES = ["Pending", "Scheduled", "Booked", "En Route", "On Site", "In Progress", "no_show", "parts_needed", "parts_ordered"];
  const ACTIVE_STATUSES = ["Pending", "Scheduled", "Booked", "En Route", "On Site", "In Progress", "no_show", "parts_needed", "parts_ordered", "Awaiting Deposit", "Cancelled"];
  const IN_PROGRESS_STATUSES = ["En Route", "On Site", "In Progress"];

  // Separate incoming jobs from the rest
  const incomingJobs = jobs.filter(j => j.status === "incoming");
  const nonIncomingJobs = jobs.filter(j => j.status !== "incoming");

  const applyFilters = (list: Job[]) =>
    list.filter(j => {
      let matchStatus: boolean;
      if (statusFilter === "all") {
        matchStatus = true;
      } else if (statusFilter === "follow_up") {
        matchStatus = j.follow_up_needed === true && !j.follow_up_resolved;
      } else if (statusFilter === "incomplete,cancelled") {
        matchStatus = INCOMPLETE_STATUSES.includes(j.status) || j.status === "Cancelled";
      } else if (statusFilter === "incomplete") {
        matchStatus = INCOMPLETE_STATUSES.includes(j.status);
      } else if (statusFilter === "parts") {
        matchStatus = j.status === "parts_needed" || j.status === "parts_ordered";
      } else {
        matchStatus = j.status === statusFilter;
      }
      const matchType = typeFilter === "all" || j.job_type === typeFilter;
      const matchSearch = !search || (j.customer_name || "").toLowerCase().includes(search.toLowerCase());
      const matchPayment = paymentFilter === "all" || (paymentFilter === "unpaid" ? !j.payment_method : j.payment_method === paymentFilter);
      const refDigits = refSearch ? extractRefDigits(refSearch) : null;
      const matchRef = !refSearch || (refDigits ? matchesJobRef(j.job_reference, refDigits) : false);
      const matchCustomerStatus =
        customerStatusFilter === "all" ||
        (customerStatusFilter === "new"
          ? j.customer_status_at_booking === "new"
          : j.customer_status_at_booking !== "new");
      return matchStatus && matchType && matchSearch && matchPayment && matchRef && matchCustomerStatus;
    });

  const applySorting = (list: Job[], overrideDir?: "asc" | "desc") => {
    const dir = overrideDir ? (overrideDir === "asc" ? 1 : -1) : (sortDir === "asc" ? 1 : -1);
    return [...list].sort((a, b) => {
      if (sortCol === "customer_name") return dir * (a.customer_name || "").localeCompare(b.customer_name || "");
      if (sortCol === "status") return dir * a.status.localeCompare(b.status);
      const da = a.scheduled_date || "";
      const db = b.scheduled_date || "";
      return dir * da.localeCompare(db);
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  // Priority groups
  const inProgressJobs = applyFilters(nonIncomingJobs.filter(j => IN_PROGRESS_STATUSES.includes(j.status)));
  const completedTodayJobs = applyFilters(nonIncomingJobs.filter(j =>
    j.status === "Completed" && (j as any).completed_at && (j as any).completed_at.slice(0, 10) === today
  )).sort((a, b) => ((b as any).completed_at || "").localeCompare((a as any).completed_at || ""));
  const upcomingJobs = applySorting(applyFilters(nonIncomingJobs.filter(j =>
    j.status !== "Completed" && !IN_PROGRESS_STATUSES.includes(j.status) && j.scheduled_date && j.scheduled_date > today
  )), "asc");
  const pendingJobs = applySorting(applyFilters(nonIncomingJobs.filter(j =>
    !IN_PROGRESS_STATUSES.includes(j.status) && j.status !== "Completed" && (!j.scheduled_date || j.scheduled_date <= today) && j.status !== "incoming"
  )), "desc");
  const completedOlderJobs = applySorting(applyFilters(nonIncomingJobs.filter(j =>
    j.status === "Completed" && (!(j as any).completed_at || (j as any).completed_at.slice(0, 10) !== today)
  )), "desc");

  const completedTotalPages = Math.ceil(completedOlderJobs.length / PAGE_SIZE);
  const completedPaginated = completedOlderJobs.slice(completedPage * PAGE_SIZE, (completedPage + 1) * PAGE_SIZE);

  const jobTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      "Boiler Service": "bg-primary/10 text-primary",
      "Boiler Replacement": "bg-violet-500/10 text-violet-600",
      "Boiler Installation": "bg-violet-500/10 text-violet-600",
      "Installation": "bg-indigo-500/10 text-indigo-600",
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
      parts_ordered: "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-600",
      incoming: "badge-due-soon",
    };
    const label = status === "no_show" ? "No Show" : status === "parts_needed" ? "Parts Needed" : status === "parts_ordered" ? "Parts Ordered" : status === "incoming" ? "Incoming" : status === "Pending" ? "Pending" : status;
    return <span className={styles[status] || "badge-scheduled"}>{label}</span>;
  };

  const paymentStatusBadge = (j: Job) => {
    if (j.payment_status === "paid" || j.payment_method === "cash" || j.payment_method === "card") {
      return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Paid</span>;
    }
    if (j.payment_method === "invoice") {
      return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Invoice Sent</span>;
    }
    if (j.status === "Completed" || IN_PROGRESS_STATUSES.includes(j.status)) {
      return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Unpaid</span>;
    }
    return <span className="text-muted-foreground">—</span>;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderJobsTable = (rows: Job[], rowBorderClass?: string) => (
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
          <TableHead>Payment</TableHead>
          <TableHead className="hidden md:table-cell">Source</TableHead>
          <TableHead className="w-[100px]">Receipt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((j) => {
          const canTakePayment = ["Completed", "In Progress"].includes(j.status);
          const hasReceipt = !!j.receipt_number;
          const partsClass = (j.status === "parts_needed" || j.status === "parts_ordered") ? "border-l-4 border-l-amber-500" : "";
          const borderClass = rowBorderClass || partsClass;
          return (
            <TableRow key={j.id} className={`cursor-pointer hover:bg-primary-light ${borderClass}`} onClick={() => navigate(`/jobs/${j.id}`)}>
              <TableCell>
                <span className="font-semibold">{j.customer_name}</span>
                <JobConfirmedBadge confirmed={j.confirmed} confirmedAt={j.confirmed_at} status={j.status} size="sm" className="ml-1.5 align-middle" />
                <NewCustomerBadge status={j.customer_status_at_booking} size="sm" className="ml-1.5 align-middle" />
                <p className="text-xs font-mono text-muted-foreground">{j.job_reference || `KN-${j.id.slice(0, 6).toUpperCase()}`}</p>
                {j.customer_address && (
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{j.customer_address}</p>
                )}
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
                {j.completed_at && j.status === "Completed" ? (
                  <span className="text-xs text-muted-foreground">Completed at {fmtTime(j.completed_at)}</span>
                ) : j.scheduled_date ? (
                  `${new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" })}${j.time_block ? ` · ${j.time_block}` : ""}`
                ) : "—"}
              </TableCell>
              <TableCell className="hidden md:table-cell">{j.assigned_engineer || "—"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {statusBadge(j.status)}
                  {(j.status === "parts_needed" || j.status === "parts_ordered") && (j as any).parts_priority && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (j as any).parts_priority === "urgent" ? "bg-destructive/10 text-destructive"
                      : (j as any).parts_priority === "low" ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-warning/10 text-warning"
                    }`}>
                      {(j as any).parts_priority === "urgent" ? "🔴" : (j as any).parts_priority === "low" ? "🟢" : "🟡"}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>{paymentStatusBadge(j)}</TableCell>
              <TableCell className="hidden md:table-cell">
                {j.source === "Quote" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary"><ClipboardList className="w-3 h-3" />Quote</span>
                ) : j.source === "Tally Form" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600">Tally</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">Manual</span>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {hasReceipt ? (
                  <button
                    onClick={() => navigate(`/receipt-view/${j.id}`)}
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
  );

  const getEngineerInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  };

  // formatWhatsApp lives in src/lib/whatsappLink.ts (shared with Declined Payments)


  const getJobBorderClass = (j: Job) => {
    if (IN_PROGRESS_STATUSES.includes(j.status)) return "border-l-4 border-l-warning";
    if (j.status === "Completed" && j.completed_at && j.completed_at.slice(0, 10) === today) return "border-l-4 border-l-success";
    if (j.status === "Cancelled") return "border-l-4 border-l-destructive";
    return "";
  };

  const renderJobCard = (j: Job) => (
    <div
      key={j.id}
      onClick={() => navigate(`/jobs/${j.id}`)}
      className={`bg-card rounded-xl border border-border/60 p-4 space-y-2.5 active:bg-muted/50 transition-colors ${getJobBorderClass(j)}`}
    >
      {/* Row 1: Customer + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-bold text-foreground truncate">{j.customer_name}</p>
            <NewCustomerBadge status={j.customer_status_at_booking} size="sm" />
          </div>
          {j.customer_address && (
            <p className="text-xs text-muted-foreground truncate">{j.customer_address}</p>
          )}
        </div>
        {statusBadge(j.status)}
      </div>

      {/* Row 2: Type + Date */}
      <div className="flex items-center gap-2 flex-wrap">
        {jobTypeBadge(j.job_type)}
        <span className="text-xs text-muted-foreground">
          {j.completed_at && j.status === "Completed"
            ? `Completed at ${fmtTime(j.completed_at)}`
            : j.scheduled_date
            ? `${new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" })}${j.time_block ? ` · ${j.time_block}` : ""}`
            : "Unscheduled"}
        </span>
      </div>

      {/* Row 3: Engineer + Payment */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary">{getEngineerInitials(j.assigned_engineer)}</span>
          </div>
          <span className="text-xs text-foreground truncate">{j.assigned_engineer || "Unassigned"}</span>
        </div>
        {paymentStatusBadge(j)}
      </div>

      {/* Contact links */}
      {j.customer_phone && (
        <div className="flex md:hidden items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <a href={`tel:${j.customer_phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Phone className="w-4 h-4" /> Call
          </a>
          <a href={`https://wa.me/${formatWhatsApp(j.customer_phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
      )}

      {/* Row 4: Job ref + Source + View */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{(j as any).job_reference || `KN-${j.id.slice(0, 4).toUpperCase()}`}</span>
          <JobConfirmedBadge confirmed={(j as any).confirmed} confirmedAt={(j as any).confirmed_at} status={(j as any).status} size="sm" />
          {j.source === "Quote" ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Quote</span>
          ) : j.source === "Tally Form" ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600">Tally</span>
          ) : (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Manual</span>
          )}
        </div>
        <button
          className="text-xs font-bold text-primary"
          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${j.id}`); }}
        >
          View →
        </button>
      </div>

      {j.follow_up_needed && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">Follow-up</span>
          {j.follow_up_detail && <span className="text-[10px] text-muted-foreground truncate">{j.follow_up_detail}</span>}
        </div>
      )}
    </div>
  );

  const renderMobileCards = (rows: Job[]) => (
    <div className="space-y-3">
      {rows.map(renderJobCard)}
    </div>
  );

  const renderJobsList = (rows: Job[], rowBorderClass?: string) => {
    if (isMobile) return renderMobileCards(rows);
    return <Card><CardContent className="p-0"><div className="overflow-x-auto">{renderJobsTable(rows, rowBorderClass)}</div></CardContent></Card>;
  };

  // Revenue total for today
  const todayRevenue = [...completedTodayJobs, ...inProgressJobs].reduce((sum, j) => sum + (j.revenue || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <button
        onClick={() => navigate("/dashboard")}
        className="md:hidden inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>
      <h1 className="text-2xl font-extrabold">All Jobs</h1>

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
        <div className="relative w-full sm:w-[160px]">
          <Input
            placeholder="Job ref e.g. 123"
            value={refSearch}
            onChange={(e) => setRefSearch(e.target.value)}
            className="text-sm"
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
            <SelectItem value="parts_ordered">Parts Ordered</SelectItem>
            <SelectItem value="parts">Parts (All)</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Boiler Service">Boiler Service</SelectItem>
            <SelectItem value="Boiler Replacement">Boiler Replacement</SelectItem>
            <SelectItem value="Boiler Installation">Boiler Installation</SelectItem>
            <SelectItem value="Installation">Installation</SelectItem>
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
        <Select value={customerStatusFilter} onValueChange={setCustomerStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="new">New Customers</SelectItem>
            <SelectItem value="existing">Existing Customers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── MOBILE: Counter chips + Date header ── */}
      {isMobile && !loading && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
            {[
              { label: "In Progress", count: inProgressJobs.length, colors: "bg-warning/10 text-warning border-warning/30" },
              { label: "Completed", count: completedTodayJobs.length, colors: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
              { label: "Upcoming", count: upcomingJobs.length, colors: "bg-primary/10 text-primary border-primary/20" },
              { label: "Pending", count: pendingJobs.length, colors: "bg-muted text-muted-foreground border-border" },
            ].map(chip => (
              <span key={chip.label} className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${chip.colors}`}>
                {chip.label} <span className="font-black">{chip.count}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              {new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            {todayRevenue > 0 && (
              <span className="text-sm font-bold text-emerald-600">{eur(todayRevenue)}</span>
            )}
          </div>
        </>
      )}

      {/* ── IN PROGRESS ── */}
      {!loading && inProgressJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
            🔧 In Progress
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-warning/10 text-warning">{inProgressJobs.length}</span>
          </h2>
          {renderJobsList(inProgressJobs, "border-l-4 border-l-warning")}
        </div>
      )}

      {/* ── COMPLETED TODAY ── */}
      {!loading && completedTodayJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
            ✅ Completed Today
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">{completedTodayJobs.length}</span>
          </h2>
          {renderJobsList(completedTodayJobs, "border-l-4 border-l-success")}
        </div>
      )}

      {/* ── UPCOMING ── */}
      {!loading && upcomingJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
            📅 Upcoming
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">{upcomingJobs.length}</span>
          </h2>
          {renderJobsList(upcomingJobs)}
        </div>
      )}

      {/* ── PENDING / UNSCHEDULED ── */}
      {!loading && pendingJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
            ⏳ Pending / Unscheduled
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">{pendingJobs.length}</span>
          </h2>
          {renderJobsList(pendingJobs)}
        </div>
      )}

      {loading && !loadFailed && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent>
        </Card>
      )}

      {loadFailed && (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-muted-foreground">Couldn't load jobs — check your connection.</p>
            <Button variant="outline" onClick={() => { retryCount.current = 0; fetchJobs(); }}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}


      {/* ── COMPLETED (OLDER) ── */}
      {completedOlderJobs.length > 0 && (
        <div>
          <Button
            variant="outline"
            className="gap-2 font-bold"
            onClick={() => { setShowCompleted(s => !s); setCompletedPage(0); }}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-180" : ""}`} />
            {showCompleted ? "Hide" : "Show"} Completed ({completedOlderJobs.length})
          </Button>
          {showCompleted && completedPaginated.length > 0 && (
            <div className="mt-2">
              {isMobile ? (
                renderMobileCards(completedPaginated)
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      {renderJobsTable(completedPaginated)}
                    </div>
                  </CardContent>
                </Card>
              )}
              {completedTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-2">
                  <p className="text-sm text-muted-foreground">
                    {completedPage * PAGE_SIZE + 1}–{Math.min((completedPage + 1) * PAGE_SIZE, completedOlderJobs.length)} of {completedOlderJobs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={completedPage === 0} onClick={() => setCompletedPage(p => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={completedPage >= completedTotalPages - 1} onClick={() => setCompletedPage(p => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
