import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type MessageLogRow = {
  id: string;
  organisation_id: string | null;
  customer_id: string | null;
  message_type: string | null;
  channel: string | null;
  status: string | null;
  content: string | null;
  error_message?: string | null;
  related_id?: string | null;
  related_type?: string | null;
  sent_by?: string | null;
  sent_at: string | null;
  created_at?: string | null;
};

type DebugLogRow = {
  id: string;
  event: string | null;
  job_id: string | null;
  payload: any;
  created_at: string | null;
};

const extractDomain = (content: string | null | undefined): string | null => {
  if (!content) return null;
  const m = content.match(/https?:\/\/([a-z0-9-]+\.bookedjobs\.ie)/i);
  return m ? m[1] : null;
};

const DomainBadge = ({ domain }: { domain: string | null }) => {
  if (!domain) return <Badge variant="secondary">unknown</Badge>;
  const hyphenSub = domain.split(".")[0]?.includes("-");
  return (
    <Badge variant={hyphenSub ? "destructive" : "default"} className="font-mono">
      {domain}
    </Badge>
  );
};

const StatusBadge = ({ status }: { status: string | null }) => {
  const s = (status || "").toLowerCase();
  if (s === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" /> sent</Badge>;
  if (s === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> failed</Badge>;
  if (s === "pending") return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> pending</Badge>;
  return <Badge variant="outline">{status || "—"}</Badge>;
};

export default function WhatsAppDiagnostics() {
  const { orgId, ready } = useOrgId();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MessageLogRow[]>([]);
  const [blocks, setBlocks] = useState<DebugLogRow[]>([]);
  const [tenantDomain, setTenantDomain] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [msgs, dbg, integ, org] = await Promise.all([
        supabase
          .from("message_log")
          .select("*")
          .eq("organisation_id", orgId)
          .eq("channel", "whatsapp")
          .order("sent_at", { ascending: false })
          .limit(25),
        supabase
          .from("debug_logs")
          .select("*")
          .like("event", "send-quote-whatsapp:%")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("tenant_integrations")
          .select("config")
          .eq("organisation_id", orgId)
          .eq("integration_type", "whatsapp")
          .maybeSingle(),
        supabase
          .from("organisations")
          .select("slug")
          .eq("id", orgId)
          .maybeSingle(),
      ]);

      setRows((msgs.data as MessageLogRow[]) || []);
      setBlocks((dbg.data as DebugLogRow[]) || []);
      const cfg: any = (integ.data as any)?.config;
      const configuredDomain = cfg?.domain || null;
      const orgSlug = (org.data as any)?.slug || null;
      setSlug(orgSlug);
      setTenantDomain(configuredDomain || (orgSlug ? `${orgSlug}.bookedjobs.ie` : null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && orgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, orgId]);

  const last = rows[0];
  const lastDomain = extractDomain(last?.content);
  const lastHyphenated = !!lastDomain && lastDomain.split(".")[0].includes("-");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Last outbound WhatsApp attempts, resolved tenant domain, and domain-regression guard trips.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading || !orgId}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Resolved tenant domain</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Configured / fallback:</span>
          <DomainBadge domain={tenantDomain} />
          <span className="text-muted-foreground">Slug:</span>
          <code className="text-xs bg-muted px-2 py-0.5 rounded">{slug || "—"}</code>
          <span className="text-muted-foreground">Org:</span>
          <code className="text-xs bg-muted px-2 py-0.5 rounded">{orgId || "—"}</code>
        </div>
        {tenantDomain && tenantDomain.split(".")[0].includes("-") && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            Configured domain contains a hyphen — the guard will block sends. Fix
            <code className="bg-muted px-1 rounded">tenant_integrations.whatsapp.config.domain</code>.
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Last send attempt</h2>
        {!last ? (
          <p className="text-sm text-muted-foreground">No WhatsApp messages logged yet for this organisation.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={last.status} /></div>
            <div><span className="text-muted-foreground">Type:</span> {last.message_type || "—"}</div>
            <div><span className="text-muted-foreground">Sent at:</span> {last.sent_at ? new Date(last.sent_at).toLocaleString() : "—"}</div>
            <div><span className="text-muted-foreground">Domain in message:</span> <DomainBadge domain={lastDomain} /></div>
            <div>
              <span className="text-muted-foreground">organisation_id on row:</span>{" "}
              {last.organisation_id ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">present</Badge>
              ) : (
                <Badge variant="destructive">NULL</Badge>
              )}
            </div>
            <div><span className="text-muted-foreground">Related:</span> {last.related_type}/{last.related_id?.slice(0, 8)}</div>
            {last.error_message && (
              <div className="sm:col-span-2 text-destructive text-xs whitespace-pre-wrap">{last.error_message}</div>
            )}
            {lastHyphenated && (
              <div className="sm:col-span-2 flex items-start gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                Hyphenated domain detected in last message — domain regression is live.
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recent domain-regression guard trips
        </h2>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guard trips recorded. ✅</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div key={b.id} className="text-xs border rounded p-2 bg-muted/30">
                <div className="flex justify-between mb-1">
                  <span className="font-mono">{b.event}</span>
                  <span className="text-muted-foreground">
                    {b.created_at ? new Date(b.created_at).toLocaleString() : ""}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(b.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Last 25 WhatsApp messages (this organisation)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">When</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">org_id</th>
                <th className="py-1 pr-2">Domain in msg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = extractDomain(r.content);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 pr-2 whitespace-nowrap">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                    <td className="py-1 pr-2">{r.message_type}</td>
                    <td className="py-1 pr-2"><StatusBadge status={r.status} /></td>
                    <td className="py-1 pr-2">{r.organisation_id ? "✅" : <span className="text-destructive">NULL</span>}</td>
                    <td className="py-1 pr-2"><DomainBadge domain={d} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
