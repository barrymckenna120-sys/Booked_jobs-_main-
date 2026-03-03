import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ClipboardList, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

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
  customer_name?: string;
};

const Jobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (user) fetchJobs();
  }, [user]);

  useEffect(() => { setPage(0); }, [statusFilter, typeFilter, search]);

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
        .select("id, name")
        .in("id", customerIds);
      const nameMap = Object.fromEntries((customers || []).map(c => [c.id, c.name]));
      setJobs(jobsData.map(j => ({ ...j, customer_name: nameMap[j.customer_id] || "Unknown" })) as Job[]);
    }
    setLoading(false);
  };

  const filtered = jobs.filter(j => {
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchType = typeFilter === "all" || j.job_type === typeFilter;
    const matchSearch = !search || (j.customer_name || "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
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
      Scheduled: "badge-scheduled",
      Completed: "badge-up-to-date",
      Cancelled: "badge-overdue",
      "Awaiting Deposit": "badge-due-soon",
    };
    return <span className={styles[status] || "badge-scheduled"}>{status}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-extrabold">All Jobs</h1>

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
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="Awaiting Deposit">Awaiting Deposit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Boiler Service">Boiler Service</SelectItem>
            <SelectItem value="Repair">Repair</SelectItem>
            <SelectItem value="Emergency">Emergency</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden md:table-cell">Engineer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Quote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((j) => (
                    <TableRow key={j.id} className="cursor-pointer hover:bg-primary-light" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <TableCell className="font-semibold">{j.customer_name}</TableCell>
                      <TableCell>{jobTypeBadge(j.job_type)}</TableCell>
                      <TableCell>
                        {j.scheduled_date
                          ? `${new Date(j.scheduled_date + "T00:00:00").toLocaleDateString("en-GB")}${j.time_block ? ` · ${j.time_block}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{j.assigned_engineer || "—"}</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell className="hidden md:table-cell">{j.has_quote ? <ClipboardList className="w-4 h-4 text-primary" /> : "—"}</TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
};

export default Jobs;
