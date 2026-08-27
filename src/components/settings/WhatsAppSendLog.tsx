import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import {
  LOG_STATUS_CLASS,
  LOG_STATUS_LABEL,
  formatMessageType,
  formatRecipientPhone,
  normaliseLogStatus,
  relatedLabel,
  type RelatedRefMaps,
} from "@/lib/whatsappLogRow";

interface LogRow {
  id: string;
  sent_at: string | null;
  created_at: string | null;
  customer_id: string | null;
  message_type: string | null;
  status: string | null;
  error_message: string | null;
  recipient_phone: string | null;
  related_id: string | null;
  related_type: string | null;
  content: string | null;
}

const STATUS_FILTERS = ["All", "Queued", "Sent", "Delivered", "Read", "Failed"] as const;

/**
 * Live log of outgoing WhatsApp messages for the current organisation.
 * Read-only: SELECTs plus a realtime subscription on message_log.
 */
const WhatsAppSendLog = () => {
  const { orgId } = useOrgId();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<RelatedRefMaps>({ quotes: {}, jobs: {}, invoices: {} });
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("message_log")
      .select("*")
      .eq("organisation_id", orgId)
      .eq("channel", "whatsapp")
      .neq("direction", "inbound")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(200);

    const list = ((data as unknown) as LogRow[]) || [];
    setRows(list);

    const customerIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean))] as string[];
    const idsFor = (type: string) =>
      [
        ...new Set(
          list
            .filter((r) => (r.related_type || "").toLowerCase() === type && r.related_id)
            .map((r) => r.related_id as string),
        ),
      ];
    const quoteIds = idsFor("quote");
    const invoiceIds = idsFor("invoice");
    const jobIds = [...new Set([...idsFor("service_call"), ...idsFor("job")])];

    const [custRes, quoteRes, jobRes, invRes] = await Promise.all([
      customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [] as any[] }),
      quoteIds.length
        ? supabase.from("quotes").select("id, quote_number").in("id", quoteIds)
        : Promise.resolve({ data: [] as any[] }),
      jobIds.length
        ? supabase.from("service_calls").select("id, job_reference").in("id", jobIds)
        : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length
        ? supabase.from("invoices").select("id, invoice_number").in("id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    setCustomers(
      Object.fromEntries(((custRes.data as any[]) || []).map((c) => [c.id, c.name as string])),
    );
    setRefs({
      quotes: Object.fromEntries(
        ((quoteRes.data as any[]) || []).map((q) => [q.id, q.quote_number as string]),
      ),
      jobs: Object.fromEntries(
        ((jobRes.data as any[]) || []).map((j) => [j.id, j.job_reference as string]),
      ),
      invoices: Object.fromEntries(
        ((invRes.data as any[]) || []).map((i) => [i.id, i.invoice_number as string]),
      ),
    });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, load]);

  // Live updates: any insert/update on this org's message_log refreshes the list.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`message-log-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_log",
          filter: `organisation_id=eq.${orgId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const statusKey = normaliseLogStatus(r.status);
      if (statusFilter !== "All" && LOG_STATUS_LABEL[statusKey] !== statusFilter) return false;
      if (!s) return true;
      const name = (r.customer_id ? customers[r.customer_id] : "") || "";
      const related = relatedLabel(r.related_type, r.related_id, refs);
      return (
        name.toLowerCase().includes(s) ||
        (r.recipient_phone || "").toLowerCase().includes(s) ||
        (r.message_type || "").toLowerCase().includes(s) ||
        related.toLowerCase().includes(s)
      );
    });
  }, [rows, statusFilter, search, customers, refs]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your WhatsApp message log…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Live message log
            </CardTitle>
            <CardDescription>
              Outgoing WhatsApp messages from the messaging provider, newest first. Updates live.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, number, type or quote…"
            className="sm:max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "All" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No outgoing WhatsApp messages match this view yet.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {visible.map((r) => {
              const statusKey = normaliseLogStatus(r.status);
              const when = r.sent_at || r.created_at;
              return (
                <div key={r.id} className="space-y-1 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {(r.customer_id && customers[r.customer_id]) || "Unknown recipient"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatRecipientPhone(r.recipient_phone)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${LOG_STATUS_CLASS[statusKey]}`}
                    >
                      {LOG_STATUS_LABEL[statusKey]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {when ? format(new Date(when), "d MMM yyyy HH:mm") : "No timestamp"}
                    </span>
                    <span aria-hidden>•</span>
                    <span>{formatMessageType(r.message_type)}</span>
                    {relatedLabel(r.related_type, r.related_id, refs) !== "—" && (
                      <>
                        <span aria-hidden>•</span>
                        <span>{relatedLabel(r.related_type, r.related_id, refs)}</span>
                      </>
                    )}
                  </div>
                  {statusKey === "failed" && r.error_message && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {r.error_message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppSendLog;
