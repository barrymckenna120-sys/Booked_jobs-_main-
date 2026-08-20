import { useState, useEffect, useMemo } from "react";
import { addDays, isAfter, isBefore, isToday, parseISO } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ChevronLeft, ChevronRight, MapPin, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import AddCustomerSheet from "@/components/customer/AddCustomerSheet";
import { extractRefDigits } from "@/lib/jobRefSearch";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";

const PAGE_SIZE = 15;

const TAG_FILTERS = [
  { name: "New Boiler Fitted", colour: "#4A86E8" },
  { name: "New Boiler Soon", colour: "#F59E0B" },
  { name: "Under Warranty", colour: "#10B981" },
];

const Customers = () => {
  const { user } = useAuth();
  const { orgId, ready } = useOrgId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [areaFilters, setAreaFilters] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCustomerIds, setTagCustomerIds] = useState<Set<string> | null>(null);
  const [refCustomerIds, setRefCustomerIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  // Derived (not stored): customers whose ONLY job was booked as a new customer
  const [newCustomerIds, setNewCustomerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user && ready) fetchCustomers();
  }, [user, ready]);

  // Derive the "New Customer" badge from existing job rows: exactly one job total
  // and that job was booked with customer_status_at_booking = 'new'.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    supabase
      .from("service_calls")
      .select("customer_id, customer_status_at_booking")
      .eq("organisation_id", orgId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const counts = new Map<string, { total: number; newAtBooking: number }>();
        for (const row of data as any[]) {
          if (!row.customer_id) continue;
          const entry = counts.get(row.customer_id) || { total: 0, newAtBooking: 0 };
          entry.total += 1;
          if (row.customer_status_at_booking === "new") entry.newAtBooking += 1;
          counts.set(row.customer_id, entry);
        }
        const ids = new Set<string>();
        counts.forEach((v, id) => {
          if (v.total === 1 && v.newAtBooking === 1) ids.add(id);
        });
        setNewCustomerIds(ids);
      });
    return () => { cancelled = true; };
  }, [orgId, customers.length]);

  // Realtime: re-fetch on INSERT so new customers appear instantly
  useEffect(() => {
    const channel = supabase
      .channel("customers-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customers" },
        () => { fetchCustomers(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { setPage(0); }, [search, statusFilter, areaFilters, selectedTags]);

  // When search looks like a job ref, look up the linked customer
  useEffect(() => {
    const digits = extractRefDigits(search.trim());
    if (digits) {
      const ref = "KN-" + digits.padStart(3, "0");
      supabase
        .from("service_calls")
        .select("customer_id")
        .eq("job_reference", ref)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setRefCustomerIds(new Set(data.map((j) => j.customer_id)));
          } else {
            setRefCustomerIds(new Set());
          }
        });
    } else {
      setRefCustomerIds(null);
    }
  }, [search]);

  // Fetch customer IDs matching selected tags
  useEffect(() => {
    if (selectedTags.length === 0) {
      setTagCustomerIds(null);
      return;
    }
    const fetchTaggedCustomers = async () => {
      // Get tag IDs for selected tag names
      const { data: tags } = await supabase
        .from("job_tags")
        .select("id, name")
        .in("name", selectedTags);
      if (!tags || tags.length === 0) { setTagCustomerIds(new Set()); return; }

      const tagIds = tags.map((t) => t.id);
      const { data: sctRows } = await supabase
        .from("service_call_tags")
        .select("service_call_id")
        .in("tag_id", tagIds);
      if (!sctRows || sctRows.length === 0) { setTagCustomerIds(new Set()); return; }

      const jobIds = [...new Set(sctRows.map((r) => r.service_call_id))];
      const { data: jobs } = await supabase
        .from("service_calls")
        .select("customer_id")
        .in("id", jobIds)
        .eq("status", "Completed");
      if (jobs) {
        setTagCustomerIds(new Set(jobs.map((j) => j.customer_id)));
      } else {
        setTagCustomerIds(new Set());
      }
    };
    fetchTaggedCustomers();
  }, [selectedTags]);

  const toggleTagFilter = (name: string) => {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const fetchCustomers = async () => {
    if (!orgId) return;
    setLoading(true);
    const CACHE_KEY = "bookedjobs_customers_cache";

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setCustomers(parsed || []);
        setLoading(false);
      }
    } catch (e) {}

    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("organisation_id", orgId)
        .order("name");
      if (data) {
        // Sort by surname (last word of name) A-Z
        data.sort((a: any, b: any) => {
          const surnameA = (a.name || "").trim().split(/\s+/).pop()?.toLowerCase() || "";
          const surnameB = (b.name || "").trim().split(/\s+/).pop()?.toLowerCase() || "";
          return surnameA.localeCompare(surnameB);
        });
        setCustomers(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data || []));
        } catch (e) {}
      }
    } catch (error) {
      setTimeout(() => fetchCustomers(), 5000);
    } finally {
      setLoading(false);
    }
  };

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    customers.forEach((c) => {
      const code = c.area_code || "No Area";
      counts[code] = (counts[code] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [customers]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const textMatch = c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q) || c.eircode?.toLowerCase().includes(q) || (c as any).gprn?.toLowerCase().includes(q);
    const refMatch = refCustomerIds !== null && refCustomerIds.has(c.id);
    const matchesSearch = refCustomerIds !== null ? (refMatch || textMatch) : textMatch;

    // Compute dynamic status from next_service_due
    let computedStatus = "Up to Date";
    if (c.next_service_due) {
      const due = parseISO(c.next_service_due + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in30 = addDays(today, 30);
      if (isBefore(due, today) && !isToday(due)) {
        computedStatus = "Overdue";
      } else if ((isToday(due) || isAfter(due, today)) && (isBefore(due, in30) || due.getTime() === in30.getTime())) {
        computedStatus = "Due Soon";
      }
    }

    const matchesStatus = statusFilter === "all" || computedStatus === statusFilter;
    const matchesArea = areaFilters.length === 0 || areaFilters.includes(c.area_code || "No Area");
    const matchesTags = tagCustomerIds === null || tagCustomerIds.has(c.id);
    return matchesSearch && matchesStatus && matchesArea && matchesTags;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusBadge = (status: string) => {
    switch (status) {
      case "Overdue": return <span className="badge-overdue flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overdue</span>;
      case "Due Soon": return <span className="badge-due-soon flex items-center gap-1"><Clock className="w-3 h-3" /> Due Soon</span>;
      default: return <span className="badge-up-to-date flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Up to Date</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">Customers</h1>
          <span className="text-sm text-muted-foreground/70">{customers.length} total</span>
          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              Filtered: {statusFilter}
              <button onClick={() => { setStatusFilter("all"); setSearchParams({}); }} className="ml-1 hover:text-destructive">✕</button>
            </span>
          )}
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Customer
        </Button>
      </div>

      {/* Area Code Breakdown */}
      {areaCounts.length > 0 && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">Customers by Area Code</p>
                {areaFilters.length > 0 && (
                  <button onClick={() => setAreaFilters([])} className="text-xs text-primary hover:underline">Clear</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {areaCounts.map(([code, count]) => {
                  const isActive = areaFilters.includes(code);
                  return (
                    <button
                      key={code}
                      onClick={() => setAreaFilters((prev) => prev.includes(code) ? prev.filter((a) => a !== code) : [...prev, code])}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
                    >
                      <MapPin className="w-3 h-3" /> {code} <span className={`font-extrabold ${isActive ? "text-primary-foreground" : "text-foreground"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, address..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Up to Date">Up to Date</SelectItem>
            <SelectItem value="Due Soon">Due Soon</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tag Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {TAG_FILTERS.map((tag) => {
          const isSelected = selectedTags.includes(tag.name);
          return (
            <button
              key={tag.name}
              type="button"
              onClick={() => toggleTagFilter(tag.name)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer"
              style={{
                borderColor: tag.colour,
                backgroundColor: isSelected ? tag.colour : "transparent",
                color: isSelected ? "#fff" : tag.colour,
              }}
            >
              {tag.name}
            </button>
          );
        })}
      </div>

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
                    <TableHead className="text-xs uppercase font-semibold">Phone</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Address</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Eircode</TableHead>
                    <TableHead className="hidden lg:table-cell text-xs uppercase font-semibold">Area</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-primary-light transition-colors" onClick={() => navigate(`/customers/${c.id}`)}>
                      <TableCell className="font-semibold">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {c.name}
                          <NewCustomerBadge status={newCustomerIds.has(c.id) ? "new" : null} size="sm" />
                        </span>
                      </TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell className="hidden md:table-cell">{c.address}</TableCell>
                      <TableCell className="hidden md:table-cell">{c.eircode}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{c.area_code || "—"}</TableCell>
                      <TableCell>{(() => {
                        let s = "Up to Date";
                        if (c.next_service_due) {
                          const due = parseISO(c.next_service_due + "T00:00:00");
                          const today = new Date(); today.setHours(0,0,0,0);
                          const in30 = addDays(today, 30);
                          if (isBefore(due, today) && !isToday(due)) s = "Overdue";
                          else if ((isToday(due) || isAfter(due, today)) && (isBefore(due, in30) || due.getTime() === in30.getTime())) s = "Due Soon";
                        }
                        return statusBadge(s);
                      })()}</TableCell>
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
                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <AddCustomerSheet open={addOpen} onOpenChange={setAddOpen} onSuccess={fetchCustomers} />
    </div>
  );
};

export default Customers;
