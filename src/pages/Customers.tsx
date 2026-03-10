import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ChevronLeft, ChevronRight, MapPin, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import AddCustomerSheet from "@/components/customer/AddCustomerSheet";

const PAGE_SIZE = 15;

const Customers = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (user) fetchCustomers();
  }, [user]);

  useEffect(() => { setPage(0); }, [search, statusFilter, areaFilter]);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").order("name");
    if (data) setCustomers(data);
    setLoading(false);
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
    const matchesSearch = c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q) || c.eircode?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || (c.service_status || "Up to Date") === statusFilter;
    const matchesArea = !areaFilter || (c.area_code || "No Area") === areaFilter;
    return matchesSearch && matchesStatus && matchesArea;
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
              {areaFilter && (
                <button onClick={() => setAreaFilter(null)} className="text-xs text-primary hover:underline">Clear filter</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {areaCounts.map(([code, count]) => (
                <button
                  key={code}
                  onClick={() => setAreaFilter(areaFilter === code ? null : code)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${areaFilter === code ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
                >
                  <MapPin className="w-3 h-3" /> {code} <span className={`font-extrabold ${areaFilter === code ? "text-primary-foreground" : "text-foreground"}`}>{count}</span>
                </button>
              ))}
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

      {/* Customer Table */}
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
                      <TableCell className="font-semibold">{c.name}</TableCell>
                      <TableCell>{c.phone}</TableCell>
                      <TableCell className="hidden md:table-cell">{c.address}</TableCell>
                      <TableCell className="hidden md:table-cell">{c.eircode}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{c.area_code || "—"}</TableCell>
                      <TableCell>{statusBadge(c.service_status || "Up to Date")}</TableCell>
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
    </div>
  );
};

export default Customers;
