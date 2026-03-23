import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, Download, AlertTriangle, Eye, RotateCcw, CalendarIcon, ArrowLeft, MessageSquare } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  delivered: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "📲",
  in_app: "💬",
  email: "📧",
};

const TYPE_OPTIONS = ["All", "quote", "renewal", "receipt", "job_update", "reminder", "broadcast"];
const STATUS_OPTIONS = ["All", "sent", "delivered", "failed", "pending"];
const CHANNEL_OPTIONS = ["All", "whatsapp", "in_app", "email"];

const MessageLog = () => {
  const { user } = useAuth();
  const { role } = useUserRole(user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEngineer = role === "engineer";

  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [customerSearch, setCustomerSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [channelFilter, setChannelFilter] = useState("All");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["message-log-full", user?.id, role, dateFrom.toISOString(), dateTo.toISOString(), typeFilter, statusFilter, channelFilter],
    queryFn: async () => {
      let query = supabase
        .from("message_log")
        .select("*")
        .gte("sent_at", startOfDay(dateFrom).toISOString())
        .lte("sent_at", endOfDay(dateTo).toISOString())
        .order("sent_at", { ascending: false })
        .limit(500);

      if (isEngineer) query = query.eq("sent_by", user!.id);
      if (typeFilter !== "All") query = query.eq("message_type", typeFilter);
      if (statusFilter !== "All") query = query.eq("status", statusFilter);
      if (channelFilter !== "All") query = query.eq("channel", channelFilter);

      const { data } = await query;
      return data || [];
    },
    enabled: !!user,
  });

  // Get customer names
  const customerIds = [...new Set(entries.filter((e: any) => e.customer_id).map((e: any) => e.customer_id))];
  const { data: customers = [] } = useQuery({
    queryKey: ["message-log-customers", customerIds.join(",")],
    queryFn: async () => {
      if (customerIds.length === 0) return [];
      const { data } = await supabase.from("customers").select("id, name").in("id", customerIds);
      return data || [];
    },
    enabled: customerIds.length > 0,
  });
  const customerMap = Object.fromEntries((customers as any[]).map((c: any) => [c.id, c.name]));

  const filtered = useMemo(() => {
    if (!customerSearch.trim()) return entries;
    const s = customerSearch.toLowerCase();
    return entries.filter((e: any) => {
      const name = customerMap[e.customer_id] || "";
      return name.toLowerCase().includes(s);
    });
  }, [entries, customerSearch, customerMap]);

  const handleExportCSV = () => {
    const header = "Time,Customer,Type,Message,Status,Channel,Sent By,Error\n";
    const rows = filtered.map((e: any) =>
      [
        e.sent_at ? format(new Date(e.sent_at), "yyyy-MM-dd HH:mm") : "",
        `"${(customerMap[e.customer_id] || "Unknown").replace(/"/g, '""')}"`,
        e.message_type || "",
        `"${(e.content || "").substring(0, 200).replace(/"/g, '""').replace(/\n/g, " ")}"`,
        e.status || "",
        e.channel || "",
        e.sent_by || "",
        `"${(e.error_message || "").replace(/"/g, '""')}"`,
      ].join(",")
    ).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `message-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetry = async (entry: any) => {
    if (entry.channel !== "whatsapp" || entry.related_type !== "quote" || !entry.related_id) {
      toast({ title: "Retry is only available for WhatsApp quote sends", variant: "destructive" });
      return;
    }
    setRetrying(entry.id);
    try {
      // Fetch quote + customer details for resend
      const { data: quote } = await supabase
        .from("quotes")
        .select("*, customers!inner(name, phone)")
        .eq("id", entry.related_id)
        .single();

      if (!quote) {
        toast({ title: "Quote not found", variant: "destructive" });
        setRetrying(null);
        return;
      }

      const { data: settings } = await supabase.from("settings").select("business_phone, business_name, whatsapp_number").limit(1).single();

      const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
        body: {
          quote_id: quote.id,
          customer_name: (quote as any).customers?.name,
          mobile_number: (quote as any).customers?.phone,
          job_description: quote.description,
          quote_amount: quote.total_amount,
          parts_cost: quote.parts_cost,
          labour_cost: quote.labour_cost,
          deposit_amount: quote.deposit_amount || quote.deposit,
          business_phone: settings?.whatsapp_number || settings?.business_phone,
          business_name: settings?.business_name,
          pdf_url: quote.pdf_url,
          quote_number: quote.quote_number,
          customer_id: quote.customer_id,
          sent_by_user_id: user?.id,
        },
      });

      if (error || !data?.success) {
        toast({ title: "Retry failed", description: data?.error_detail || error?.message, variant: "destructive" });
      } else {
        toast({ title: `WhatsApp resent successfully to ${(quote as any).customers?.name} ✅`, duration: 4000 });
        queryClient.invalidateQueries({ queryKey: ["message-log-full"] });
      }
    } catch (err: any) {
      toast({ title: "Retry error", description: err.message, variant: "destructive" });
    }
    setRetrying(null);
  };

  const getRelatedLink = (entry: any) => {
    if (!entry.related_id || !entry.related_type) return null;
    switch (entry.related_type) {
      case "quote": return `/quotes/${entry.related_id}`;
      case "job": return `/jobs/${entry.related_id}`;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-extrabold text-foreground">Message Log</h1>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date From */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">From</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left text-sm font-normal">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                  {format(dateFrom, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">To</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left text-sm font-normal">
                  <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                  {format(dateTo, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Customer Search */}
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-muted-foreground">Customer</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customer…" className="pl-8 h-9 text-sm" />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>{t === "All" ? "All" : t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channel */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Channel</label>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c === "All" ? "All" : c === "in_app" ? "In-App" : c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Export */}
          {!isEngineer && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="ml-auto h-9">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <div className="p-8 text-center space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No messages found</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Time</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Message</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center hidden sm:table-cell">Channel</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Sent By</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {entry.sent_at ? format(new Date(entry.sent_at), "dd MMM HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{customerMap[entry.customer_id] || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground capitalize">{(entry.message_type || "").replace("_", " ")}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground max-w-[200px] truncate">{(entry.content || "").substring(0, 60)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {entry.status === "failed" && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[entry.status] || STATUS_STYLE.pending}`}>
                          {entry.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">{CHANNEL_ICON[entry.channel] || "📨"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {entry.sent_by === "system" ? "System" : entry.sent_by?.substring(0, 8) || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedEntry(entry)}>
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>
                        {!isEngineer && entry.status === "failed" && entry.channel === "whatsapp" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary border-primary/30"
                            disabled={retrying === entry.id}
                            onClick={() => handleRetry(entry)}
                          >
                            {retrying === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RotateCcw className="w-3 h-3 mr-1" /> Retry</>}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail Panel */}
      <Sheet open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedEntry && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Message Detail
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Time</p>
                    <p className="text-sm">{selectedEntry.sent_at ? format(new Date(selectedEntry.sent_at), "dd MMM yyyy HH:mm") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Customer</p>
                    <p className="text-sm font-semibold">{customerMap[selectedEntry.customer_id] || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Type</p>
                    <p className="text-sm capitalize">{(selectedEntry.message_type || "").replace("_", " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Channel</p>
                    <p className="text-sm">{CHANNEL_ICON[selectedEntry.channel] || "📨"} {selectedEntry.channel === "in_app" ? "In-App" : (selectedEntry.channel || "").charAt(0).toUpperCase() + (selectedEntry.channel || "").slice(1)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Status</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {selectedEntry.status === "failed" && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[selectedEntry.status] || STATUS_STYLE.pending}`}>
                        {selectedEntry.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Sent By</p>
                    <p className="text-sm">{selectedEntry.sent_by === "system" ? "System" : selectedEntry.sent_by || "—"}</p>
                  </div>
                </div>

                {/* Full message content */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Message Content</p>
                  <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto">
                    {selectedEntry.content || "No content"}
                  </div>
                </div>

                {/* Error message */}
                {selectedEntry.error_message && (
                  <div>
                    <p className="text-xs font-semibold text-destructive mb-1">Error</p>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                      {selectedEntry.error_message}
                    </div>
                  </div>
                )}

                {/* Related record link */}
                {getRelatedLink(selectedEntry) && (
                  <Button variant="outline" size="sm" onClick={() => { setSelectedEntry(null); navigate(getRelatedLink(selectedEntry)!); }}>
                    View {selectedEntry.related_type?.charAt(0).toUpperCase() + selectedEntry.related_type?.slice(1)} →
                  </Button>
                )}

                {/* Retry button */}
                {!isEngineer && selectedEntry.status === "failed" && selectedEntry.channel === "whatsapp" && (
                  <Button
                    className="w-full"
                    disabled={retrying === selectedEntry.id}
                    onClick={() => handleRetry(selectedEntry)}
                  >
                    {retrying === selectedEntry.id ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
                    Retry WhatsApp Send
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MessageLog;
