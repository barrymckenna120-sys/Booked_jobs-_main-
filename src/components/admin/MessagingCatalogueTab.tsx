import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  CATALOGUE_CATEGORIES,
  CONFIG_KEYS,
  STATUS_LABEL,
  WHATSAPP_CATALOGUE,
  deriveMessageStatus,
  renderPreview,
  resolveTenantConfig,
  type ConfigKeyId,
  type IntegrationRow,
  type MessageStatus,
  type SettingsRow,
} from "@/lib/whatsappCatalogue";

type Org = { id: string; name: string; slug: string };

const STATUS_STYLE: Record<MessageStatus, string> = {
  ready: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  degrade: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  skip: "bg-destructive/10 text-destructive border-destructive/30",
};

interface Props {
  initialOrgId?: string;
}

/**
 * Read-only superadmin view: every WhatsApp message type, with the selected
 * tenant's live resolved config values and the resulting runtime status.
 * Performs SELECTs only — never writes and never sends a message.
 */
export default function MessagingCatalogueTab({ initialOrgId }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>(initialOrgId || "");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [problemsOnly, setProblemsOnly] = useState(false);

  useEffect(() => {
    if (initialOrgId) setOrgId(initialOrgId);
  }, [initialOrgId]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select("id, name, slug")
        .order("name");
      if (error) {
        toast.error("Failed to load tenants");
        return;
      }
      setOrgs((data as Org[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!orgId) {
      setSettings(null);
      setIntegrations([]);
      return;
    }
    (async () => {
      setLoading(true);
      const [settingsRes, integrationsRes] = await Promise.all([
        supabase
          .from("settings")
          .select(
            "business_name, company_name, business_phone, company_phone, message_footer, google_review_url, cert_prefix",
          )
          .eq("organisation_id", orgId)
          .maybeSingle(),
        supabase
          .from("tenant_integrations" as any)
          .select("integration_type, config")
          .eq("organisation_id", orgId),
      ]);
      setLoading(false);
      if (settingsRes.error || integrationsRes.error) {
        toast.error("Failed to load tenant configuration");
        return;
      }
      setSettings((settingsRes.data as SettingsRow) || null);
      setIntegrations(((integrationsRes.data as unknown) as IntegrationRow[]) || []);
    })();
  }, [orgId]);

  const resolved = useMemo(
    () => resolveTenantConfig(settings, integrations),
    [settings, integrations],
  );

  const rows = useMemo(
    () =>
      WHATSAPP_CATALOGUE.map((def) => ({ def, status: deriveMessageStatus(def, resolved) })),
    [resolved],
  );

  const counts = useMemo(() => {
    const c: Record<MessageStatus, number> = { ready: 0, degrade: 0, skip: 0 };
    for (const r of rows) c[r.status.status] += 1;
    return c;
  }, [rows]);

  const visible = problemsOnly ? rows.filter((r) => r.status.status !== "ready") : rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaging Catalogue</CardTitle>
        <CardDescription>
          Every outbound WhatsApp message type, with the selected tenant's live resolved values.
          Read-only — nothing on this page sends a message or writes to the database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5 max-w-sm">
          <Label>Tenant</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a tenant..." />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant configuration…
          </div>
        )}

        {!orgId && !loading && (
          <p className="text-sm text-muted-foreground">
            Select a tenant to see resolved values for all {WHATSAPP_CATALOGUE.length} message
            types.
          </p>
        )}

        {orgId && !loading && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={STATUS_STYLE.ready}>
                {counts.ready} Ready
              </Badge>
              <Badge variant="outline" className={STATUS_STYLE.degrade}>
                {counts.degrade} Will degrade
              </Badge>
              <Badge variant="outline" className={STATUS_STYLE.skip}>
                {counts.skip} Will skip
              </Badge>
              <Button
                type="button"
                size="sm"
                variant={problemsOnly ? "default" : "outline"}
                onClick={() => setProblemsOnly((v) => !v)}
                className="ml-auto"
              >
                {problemsOnly ? "Showing problems only" : "Show problems only"}
              </Button>
            </div>

            {/* Resolved config values for this tenant */}
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-semibold">
                Resolved configuration
              </div>
              <div className="divide-y divide-border">
                {(Object.keys(CONFIG_KEYS) as ConfigKeyId[]).map((key) => {
                  const r = resolved[key];
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm"
                    >
                      <span className="w-52 shrink-0 font-medium">{CONFIG_KEYS[key].label}</span>
                      <span
                        className={
                          r.configured
                            ? "font-mono text-xs break-all"
                            : "text-xs italic text-destructive"
                        }
                      >
                        {r.configured ? r.value : "not configured"}
                      </span>
                      {r.configured && (
                        <span className="text-xs text-muted-foreground">via {r.source}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Message types by category */}
            {CATALOGUE_CATEGORIES.map((category) => {
              const catRows = visible.filter((r) => r.def.category === category);
              if (catRows.length === 0) return null;
              return (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{category}</h3>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {catRows.map(({ def, status }) => {
                      const open = !!expanded[def.id];
                      return (
                        <div key={def.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [def.id]: !e[def.id] }))
                            }
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
                            aria-expanded={open}
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-1 text-sm font-medium">{def.name}</span>
                            <Badge
                              variant="outline"
                              className={`${STATUS_STYLE[status.status]} text-xs`}
                            >
                              {STATUS_LABEL[status.status]}
                            </Badge>
                          </button>

                          {open && (
                            <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3 text-sm">
                              <p className="text-muted-foreground">{def.purpose}</p>
                              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                <span>
                                  Trigger: <span className="text-foreground">{def.trigger}</span>
                                </span>
                                <span>
                                  Function:{" "}
                                  <span className="font-mono text-foreground">{def.fn}</span>
                                </span>
                                <span>
                                  message_log type:{" "}
                                  <span className="font-mono text-foreground">
                                    {def.messageType || "—"}
                                    {def.dynamicMessageType ? " (dynamic)" : ""}
                                  </span>
                                </span>
                              </div>

                              {def.requires.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold">Config dependencies</p>
                                  {def.requires.map((req) => {
                                    const r = resolved[req.key];
                                    return (
                                      <div key={req.key} className="text-xs">
                                        <span className="font-medium">
                                          {CONFIG_KEYS[req.key].label}
                                        </span>{" "}
                                        <span className="text-muted-foreground">
                                          (missing → {req.behaviour})
                                        </span>{" "}
                                        {r.configured ? (
                                          <span className="font-mono break-all">{r.value}</span>
                                        ) : (
                                          <span className="italic text-destructive">
                                            not configured
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="space-y-1">
                                <p className="text-xs font-semibold">
                                  Preview (abridged wording structure)
                                </p>
                                <pre className="whitespace-pre-wrap rounded border border-border bg-background p-2 font-mono text-xs">
                                  {renderPreview(def, resolved)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing needs attention for this tenant.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
