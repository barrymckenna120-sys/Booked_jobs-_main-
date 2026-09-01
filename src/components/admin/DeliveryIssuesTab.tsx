import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  deliveryBadgeClasses,
  deliveryBadgeLabel,
  formatAttemptTime,
} from "@/lib/deliveryStatus";

type Row = {
  id: string;
  organisation_id: string;
  comm_type: string;
  channel: string;
  delivery_status: string;
  failure_reason_public: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  recipient: string | null;
  related_reference: string | null;
  customer_id: string | null;
};

type Attempt = {
  id: string;
  attempt_number: number;
  outcome: string;
  attempted_at: string;
  failure_reason_public: string | null;
  provider_error: string | null;
  trigger_source: string;
};

const TYPES = ["all", "quote", "invoice", "receipt", "service_reminder"];
const STATUSES = ["failed", "opted_out", "pending", "sent", "all"];

/**
 * Superadmin cross-tenant view of communication delivery problems.
 * This is the only surface that shows the raw provider error.
 */
const DeliveryIssuesTab = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("failed");
  const [commType, setCommType] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({});

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("communication_deliveries")
        .select(
          "id, organisation_id, comm_type, channel, delivery_status, failure_reason_public, attempt_count, last_attempt_at, recipient, related_reference, customer_id",
        )
        .order("last_attempt_at", { ascending: false })
        .limit(200);

      if (status !== "all") q = q.eq("delivery_status", status);
      if (commType !== "all") q = q.eq("comm_type", commType);
      if (orgFilter !== "all") q = q.eq("organisation_id", orgFilter);

      const { data, error } = await q;
      if (error) throw error;
      setRows((data as Row[]) ?? []);
    } catch (e) {
      console.error("DeliveryIssuesTab load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, commType, orgFilter]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("organisations").select("id, name");
      const map: Record<string, string> = {};
      for (const o of (data as any[]) ?? []) map[o.id] = o.name;
      setOrgs(map);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.related_reference ?? "").toLowerCase().includes(q) ||
        (r.recipient ?? "").toLowerCase().includes(q) ||
        (r.failure_reason_public ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggle = async (id: string) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next && !attempts[next]) {
      const { data } = await supabase
        .from("communication_delivery_attempts")
        .select(
          "id, attempt_number, outcome, attempted_at, failure_reason_public, provider_error, trigger_source",
        )
        .eq("delivery_id", next)
        .order("attempt_number", { ascending: true });
      setAttempts((prev) => ({ ...prev, [next]: (data as Attempt[]) ?? [] }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Communication Delivery Issues
            </CardTitle>
            <CardDescription>
              Cross-tenant delivery failures with the raw provider error for support.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : deliveryBadgeLabel(s, "whatsapp")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={commType} onValueChange={setCommType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "all" ? "All types" : t.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger><SelectValue placeholder="All tenants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {Object.entries(orgs).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Search reference, number or reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No delivery records match these filters.
          </p>
        )}

        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${deliveryBadgeClasses(r.delivery_status)}`}
                    >
                      {deliveryBadgeLabel(r.delivery_status, r.channel)}
                    </span>
                    <span className="text-xs font-bold capitalize">{r.comm_type.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {orgs[r.organisation_id] ?? "Unknown tenant"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {r.related_reference ? `${r.related_reference} · ` : ""}
                    {r.recipient ?? "no recipient"} · {formatAttemptTime(r.last_attempt_at)} ·{" "}
                    {r.attempt_count} attempt{r.attempt_count === 1 ? "" : "s"}
                  </p>
                  {r.failure_reason_public && (
                    <p className="mt-1 text-xs font-semibold text-destructive">
                      {r.failure_reason_public}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => void toggle(r.id)}>
                  {expanded === r.id ? "Hide" : "Details"}
                </Button>
              </div>

              {expanded === r.id && (
                <ul className="mt-3 space-y-2 border-t border-border pt-2">
                  {(attempts[r.id] ?? []).map((a) => (
                    <li key={a.id} className="text-[11px]">
                      <div className="font-semibold">
                        #{a.attempt_number} {a.outcome} · {formatAttemptTime(a.attempted_at)} ·{" "}
                        {a.trigger_source}
                      </div>
                      {a.failure_reason_public && (
                        <div className="text-muted-foreground">{a.failure_reason_public}</div>
                      )}
                      {a.provider_error && (
                        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted p-2 text-[10px] text-muted-foreground">
                          {a.provider_error}
                        </pre>
                      )}
                    </li>
                  ))}
                  {(attempts[r.id] ?? []).length === 0 && (
                    <li className="text-[11px] text-muted-foreground">No attempt history.</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeliveryIssuesTab;
