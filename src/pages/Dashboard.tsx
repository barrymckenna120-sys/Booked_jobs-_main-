import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Users, Phone, MapPin, Loader2, ChevronLeft, ChevronRight, ClipboardList, CreditCard, Inbox, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import WeekSnapshot from "@/components/dashboard/WeekSnapshot";
import LiveActivityFeed from "@/components/dashboard/LiveActivityFeed";
import DateRangeToggle, { type ViewMode, getDateRange } from "@/components/shared/DateRangeToggle";
import { format } from "date-fns";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  eircode: "",
  area_code: "",
  boiler_type: "",
  service_status: "Up to Date",
};

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());

  const dateRange = useMemo(() => getDateRange(viewMode, anchor), [viewMode, anchor]);

  useEffect(() => {
    if (user) {
      fetchCustomers();
      fetchIncomingCount();
    }
  }, [user]);

  const fetchIncomingCount = async (start?: Date, end?: Date) => {
    let query = supabase
      .from("service_calls")
      .select("*", { count: "exact", head: true })
      .eq("source", "Tally Form")
      .eq("incoming_status", "Pending");
    if (start && end) {
      query = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
    }
    const { count } = await query;
    setIncomingCount(count || 0);
  };

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setCustomers(data);
    setLoading(false);
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q) ||
      c.eircode?.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "all" || (c.service_status || "Up to Date") === statusFilter;
    const matchesArea = !areaFilter || (c.area_code || "No Area") === areaFilter;
    return matchesSearch && matchesStatus && matchesArea;
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, statusFilter, areaFilter]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "Overdue": return <span className="badge-overdue flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Overdue</span>;
      case "Due Soon": return <span className="badge-due-soon flex items-center gap-1"><Clock className="w-3 h-3" /> Due Soon</span>;
      default: return <span className="badge-up-to-date flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Up to Date</span>;
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.eircode.trim()) {
      toast({ title: "Missing fields", description: "Name, phone, address and eircode are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customers").insert([{
      user_id: user.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      address: form.address.trim(),
      eircode: form.eircode.trim(),
      area_code: form.area_code.trim() || null,
      boiler_type: form.boiler_type || null,
      service_status: form.service_status,
    }] as any);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer added" });
      setForm(EMPTY_FORM);
      setDialogOpen(false);
      fetchCustomers();
    }
  };

  const updateField = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

   return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header with Date Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted-foreground/70 font-medium mt-1">{dateRange.label}</p>
        </div>
        <DateRangeToggle value={viewMode} onChange={setViewMode} anchor={anchor} onAnchorChange={setAnchor} />
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-3xl font-extrabold leading-none">{customers.length}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Total Customers</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/60 cursor-pointer hover:border-destructive/40 transition-colors" onClick={() => navigate("/customers?status=Overdue")}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-3xl font-extrabold leading-none">{customers.filter(c => c.service_status === "Overdue").length}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/60 cursor-pointer hover:border-warning/40 transition-colors" onClick={() => navigate("/renewals?status=Due Soon")}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-3xl font-extrabold leading-none">{customers.filter(c => c.service_status === "Due Soon").length}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Due Soon</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`shadow-sm cursor-pointer transition-colors hover:border-warning/40 ${incomingCount > 0 ? "border-warning/60" : "border-border/60"}`} onClick={() => navigate("/incoming?status=New")}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${incomingCount > 0 ? "bg-warning/10" : "bg-success/10"}`}>
              <Inbox className={`w-5 h-5 ${incomingCount > 0 ? "text-warning" : "text-success"}`} />
            </div>
            <div>
              <p className="text-3xl font-extrabold leading-none">{incomingCount}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Incoming Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/60 cursor-pointer hover:border-success/40 transition-colors" onClick={() => navigate("/customers?status=Up to Date")}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-3xl font-extrabold leading-none">{customers.filter(c => (c.service_status || "Up to Date") === "Up to Date").length}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Up to Date</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* This Week Schedule Snapshot */}
      <WeekSnapshot />

      {/* Live Activity Feed */}
      <LiveActivityFeed />

      {/* Area Code Breakdown */}
      {(() => {
        const areaCounts = customers.reduce<Record<string, number>>((acc, c) => {
          const code = c.area_code || "No Area";
          acc[code] = (acc[code] || 0) + 1;
          return acc;
        }, {});
        const sorted = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? (
          <Card className="shadow-sm border-border/60">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wide">Customers by Area Code</p>
                {areaFilter && (
                  <button onClick={() => setAreaFilter(null)} className="text-xs text-primary hover:underline">Clear filter</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {sorted.map(([code, count]) => (
                  <button
                    key={code}
                    onClick={() => setAreaFilter(areaFilter === code ? null : code)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${areaFilter === code ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
                  >
                    <MapPin className="w-3 h-3" /> {code} <span className={`font-extrabold ${areaFilter === code ? "text-primary-foreground" : "text-foreground"}`}>{count}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {/* Search + Filter + Add */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Up to Date">Up to Date</SelectItem>
            <SelectItem value="Due Soon">Due Soon</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-md font-semibold">
              <Plus className="w-4 h-4 mr-1" /> Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Customer Name *</Label>
                  <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} required maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Phone Number *</Label>
                  <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} required maxLength={20} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} maxLength={255} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold">Address *</Label>
                  <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} required maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Eircode *</Label>
                  <Input value={form.eircode} onChange={(e) => updateField("eircode", e.target.value)} required maxLength={10} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Area Code</Label>
                  <Input value={form.area_code} onChange={(e) => updateField("area_code", e.target.value)} maxLength={10} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Boiler Type</Label>
                  <Select value={form.boiler_type} onValueChange={(v) => updateField("boiler_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="Gas">Gas</SelectItem>
                      <SelectItem value="Oil">Oil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Service Status</Label>
                  <Select value={form.service_status} onValueChange={(v) => updateField("service_status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="Up to Date">Up to Date</SelectItem>
                      <SelectItem value="Due Soon">Due Soon</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Add Customer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Customer Table */}
      <Card className="shadow-sm border-border/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {customers.length === 0
                ? "No customers yet. Click \"Add Customer\" or import from Settings."
                : "No customers match your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary">
                    <TableHead className="text-xs uppercase font-semibold">Name</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Phone</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Address</TableHead>
                    <TableHead className="hidden md:table-cell text-xs uppercase font-semibold">Eircode</TableHead>
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

export default Dashboard;
