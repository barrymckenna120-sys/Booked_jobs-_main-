import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, PauseCircle, TriangleAlert } from "lucide-react";
import {
  CATALOGUE_CATEGORIES,
  WHATSAPP_CATALOGUE,
  deriveMessageStatus,
  resolveTenantConfig,
  type IntegrationRow,
  type SettingsRow,
} from "@/lib/whatsappCatalogue";
import { TENANT_GAP_COPY } from "@/lib/messageStatusCopy";

interface Props {
  /** Lets the panel deep-link the tenant to the Settings tab holding the field. */
  onNavigateToTab?: (tab: string) => void;
}

/**
 * Tenant-facing, read-only messaging status. Shows only this tenant's own message
 * types as Active / Paused, in plain language. No template bodies, no reason codes,
 * no cross-tenant data. SELECTs only.
 */
const MessageStatusPanel = ({ onNavigateToTab }: Props) => {
  const { orgId } = useOrgId();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
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
          .from("tenant_integrations")
          .select("integration_type, config")
          .eq("organisation_id", orgId),
      ]);
      if (cancelled) return;
      setSettings((settingsRes.data as SettingsRow) || null);
      setIntegrations(((integrationsRes.data as unknown) as IntegrationRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const resolved = useMemo(
    () => resolveTenantConfig(settings, integrations),
    [settings, integrations],
  );

  const rows = useMemo(
    () => WHATSAPP_CATALOGUE.map((def) => ({ def, status: deriveMessageStatus(def, resolved) })),
    [resolved],
  );

  const pausedCount = rows.filter((r) => r.status.status === "skip").length;
  const noteCount = rows.filter((r) => r.status.status === "degrade").length;

  // Default the filter on when something is paused, once data has loaded.
  useEffect(() => {
    if (loading || initialised) return;
    setAttentionOnly(pausedCount > 0);
    setInitialised(true);
  }, [loading, initialised, pausedCount]);

  const visible = attentionOnly ? rows.filter((r) => r.status.status !== "ready") : rows;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your message setup…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {pausedCount === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <PauseCircle className="h-4 w-4 text-destructive" />
          )}
          Message Status
        </CardTitle>
        <CardDescription>
          {pausedCount === 0
            ? "All your customer messages are active."
            : `${pausedCount} message ${pausedCount === 1 ? "type is" : "types are"} paused because something still needs setting up.`}
          {noteCount > 0 && ` ${noteCount} ${noteCount === 1 ? "has" : "have"} a minor detail missing.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(pausedCount > 0 || noteCount > 0) && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant={attentionOnly ? "default" : "outline"}
              onClick={() => setAttentionOnly((v) => !v)}
            >
              {attentionOnly ? "Show all messages" : "Show only what needs attention"}
            </Button>
          </div>
        )}

        {CATALOGUE_CATEGORIES.map((category) => {
          const catRows = visible.filter((r) => r.def.category === category);
          if (catRows.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{category}</h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {catRows.map(({ def, status }) => {
                  const paused = status.status === "skip";
                  const gapKey = paused ? status.missingSkip[0] : status.missingDegrade[0];
                  const copy = gapKey ? TENANT_GAP_COPY[gapKey] : null;
                  return (
                    <div key={def.id} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{def.name}</p>
                          <p className="text-xs text-muted-foreground">{def.purpose}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            paused
                              ? "shrink-0 border-destructive/30 bg-destructive/10 text-xs text-destructive"
                              : "shrink-0 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600"
                          }
                        >
                          {paused ? "Paused — needs setup" : "Active"}
                        </Badge>
                      </div>

                      {copy && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/50 px-2 py-1.5">
                          {paused && (
                            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {paused ? copy.pausedLine : copy.degradedLine}
                          </span>
                          {copy.fix.kind === "settings-tab" ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() =>
                                onNavigateToTab?.(
                                  copy.fix.kind === "settings-tab" ? copy.fix.tab : "general",
                                )
                              }
                            >
                              Set this up
                            </Button>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              Contact support
                            </span>
                          )}
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
          <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default MessageStatusPanel;
