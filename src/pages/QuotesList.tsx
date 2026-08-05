import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgId } from "@/hooks/useOrgId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, FileText, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FILTERS = ["All", "Draft", "Sent", "Viewed", "Accepted", "Expired", "Converted", "Rejected"];

// Tab label -> lowercase status values it matches
const FILTER_STATUSES: Record<string, string[]> = {
  Draft: ["draft"],
  Sent: ["sent"],
  Viewed: ["viewed"],
  Accepted: ["accepted"],
  Expired: ["expired"],
  Converted: ["converted"],
  Rejected: ["rejected"],
};


const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  Sent: "bg-primary/10 text-primary",
  sent: "bg-primary/10 text-primary",
  viewed: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  Viewed: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  Accepted: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  accepted: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  expired: "bg-destructive/10 text-destructive",
  Rejected: "bg-destructive/10 text-destructive",
  converted: "bg-primary/10 text-primary",
  Paid: "bg-[hsl(160,84%,90%)] text-[hsl(160,84%,18%)]",
};

const QuotesList = () => {
  const { user } = useAuth();
  const { canAccessOffice } = useUserRole(user);
  const { ready } = useOrgId();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");


  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes-list", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, customers!inner(id, name, phone, address)")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user && ready,
  });

  // Fetch failed message_log entries for quotes
  const quoteIds = quotes.map((q: any) => q.id);
  const { data: failedLogs = [] } = useQuery({
    queryKey: ["failed-quote-logs", quoteIds.join(",")],
    queryFn: async () => {
      if (quoteIds.length === 0) return [];
      const { data } = await supabase
        .from("message_log")
        .select("related_id")
        .eq("related_type", "quote")
        .eq("status", "failed")
        .in("related_id", quoteIds);
      return data || [];
    },
    enabled: quoteIds.length > 0,
  });

  const failedQuoteIds = new Set((failedLogs as any[]).map((l: any) => l.related_id));

  const filtered = quotes.filter((q: any) => {
    if (filter !== "All") {
      const matchStatuses = filter === "Draft" ? ["Draft", "draft"] :
        filter === "Sent" ? ["Sent", "sent"] :
        filter === "Viewed" ? ["viewed", "Viewed"] :
        filter === "Accepted" ? ["Accepted", "accepted"] :
        filter === "expired" ? ["expired"] : [filter];
      if (!matchStatuses.includes(q.status)) return false;
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      const name = (q.customers?.name || "").toLowerCase();
      const qNum = (q.quote_number || "").toLowerCase();
      if (!name.includes(s) && !qNum.includes(s)) return false;
    }
    return true;
  });

  const statusCounts = {
    All: quotes.length,
    Draft: quotes.filter((q: any) => ["Draft", "draft"].includes(q.status)).length,
    Sent: quotes.filter((q: any) => ["Sent", "sent"].includes(q.status)).length,
    Viewed: quotes.filter((q: any) => ["viewed", "Viewed"].includes(q.status)).length,
    Accepted: quotes.filter((q: any) => ["Accepted", "accepted"].includes(q.status)).length,
    expired: quotes.filter((q: any) => q.status === "expired").length,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">Quotes</h1>
        <Button onClick={() => navigate("/quotes/new")}><Plus className="w-4 h-4 mr-1" /> New Quote</Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "expired" ? "Expired" : f} ({(statusCounts as any)[f] || 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by customer or quote number…" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No quotes found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Quote #</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Job Type</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center hidden sm:table-cell">PDF</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q: any) => {
                  const statusLabel = q.status?.charAt(0).toUpperCase() + q.status?.slice(1);
                  return (
                    <tr
                      key={q.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      <td className="px-4 py-3 font-bold text-foreground">{q.quote_number || `Q-${q.id.slice(0, 4).toUpperCase()}`}</td>
                      <td className="px-4 py-3">{q.customers?.name}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{q.job_type !== "other" ? q.job_type : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold">€{Number(q.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[q.status] || STATUS_BADGE.draft}`}>
                            {statusLabel}
                          </span>
                          {failedQuoteIds.has(q.id) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">WhatsApp send failed — check Message Log</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {q.pdf_url ? (
                          <a href={q.pdf_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <FileText className="w-4 h-4 text-primary mx-auto" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{format(new Date(q.created_at), "dd MMM yyyy")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default QuotesList;
