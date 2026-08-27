import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type Org = { id: string; name: string; slug: string };

// Field defs: [integration_type, key, label, isSecret?]
type Field = { type: string; key: string; label: string; secret?: boolean; placeholder?: string; help?: string };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Booking & Rebooking",
    fields: [
      { type: "tally", key: "new_booking_url", label: "New Booking Form URL", placeholder: "https://tally.so/r/..." },
      { type: "tally", key: "renewal_form_url", label: "Renewal/Warranty Form URL", placeholder: "https://tally.so/r/...", help: "Used for both rebooking reminders and warranty reminders. If this is blank, warranty sends skip for this tenant rather than falling back to another URL." },
    ],
  },
  {
    title: "Payments",
    fields: [
      { type: "stripe", key: "payment_link_url", label: "Stripe Payment Link URL", placeholder: "https://buy.stripe.com/..." },
    ],
  },
  {
    title: "SumUp (Deposits & Payments)",
    fields: [
      { type: "sumup", key: "merchant_code", label: "SumUp Merchant Code", placeholder: "MBBMEYG7", help: "From this tenant's own SumUp account. Required — there is deliberately no shared fallback, so a blank value means SumUp checkouts fail for this tenant rather than routing into another tenant's account." },
      { type: "sumup", key: "api_key_secret", label: "SumUp API Key Secret Name", secret: true, placeholder: "SUMUP_API_KEY_ACME_TEST", help: "Name of the backend secret holding this tenant's raw SumUp API key (not the key value itself). The secret must be added separately in Backend → Secrets." },
      { type: "sumup", key: "environment", label: "SumUp Environment", placeholder: "test or live", help: "Which SumUp account the saved merchant code and secret belong to. Sandbox and live accounts have different merchant codes, so keep a separate secret for each and switch both together." },
    ],
  },
  {
    title: "WhatsApp / 360Messenger",
    fields: [
      { type: "360messenger", key: "api_key_secret", label: "360Messenger Secret Name", secret: true, placeholder: "THREESIXTY_API_KEY_DUBLIN_GAS", help: "Name of the Supabase secret that holds the raw 360Messenger API key for this tenant (not the key value itself). The secret must be added separately in Backend → Secrets." },
      { type: "whatsapp", key: "phone_number_id", label: "WhatsApp Phone Number ID" },
      { type: "whatsapp", key: "waba_id", label: "WABA ID" },
    ],
  },
  {
    title: "Make.com Webhooks",
    fields: [
      { type: "make", key: "review_webhook_url", label: "Review Request Webhook URL", placeholder: "https://hook.eu1.make.com/..." },
      { type: "make", key: "rebook_webhook_url", label: "Rebooking Webhook URL", placeholder: "https://hook.eu1.make.com/..." },
    ],
  },
  {
    title: "Business Details",
    fields: [
      { type: "settings", key: "company_name", label: "Company Display Name" },
      { type: "settings", key: "company_phone", label: "Company Phone Number" },
      { type: "settings", key: "google_review_url", label: "Google Review URL" },
    ],
  },
];

const fieldId = (f: Field) => `${f.type}::${f.key}`;

interface CustomerIntegrationsTabProps {
  /** Cross-link into the Messaging catalogue tab for the selected tenant. */
  onViewMessaging?: (orgId: string) => void;
}

export default function CustomerIntegrationsTab({
  onViewMessaging,
}: CustomerIntegrationsTabProps = {}) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

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
      setValues({});
      return;
    }
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenant_integrations" as any)
        .select("integration_type, config")
        .eq("organisation_id", orgId);
      setLoading(false);
      if (error) {
        toast.error("Failed to load integrations");
        return;
      }
      const next: Record<string, string> = {};
      for (const section of SECTIONS) {
        for (const f of section.fields) {
          const row = (data as any[])?.find((r) => r.integration_type === f.type);
          const v = row?.config?.[f.key];
          next[fieldId(f)] = v == null ? "" : String(v);
        }
      }
      setValues(next);
    })();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      // Group values by integration_type
      const byType: Record<string, Record<string, string>> = {};
      for (const section of SECTIONS) {
        for (const f of section.fields) {
          const v = values[fieldId(f)] ?? "";
          if (!byType[f.type]) byType[f.type] = {};
          byType[f.type][f.key] = v;
        }
      }

      // Fetch existing configs to merge (preserve unrelated keys)
      const { data: existing } = await supabase
        .from("tenant_integrations" as any)
        .select("integration_type, config")
        .eq("organisation_id", orgId);

      const rows = Object.entries(byType).map(([integration_type, patch]) => {
        const prev = (existing as any[])?.find((r) => r.integration_type === integration_type)?.config ?? {};
        const cleaned = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== "" && v != null)
        );
        return {
          organisation_id: orgId,
          integration_type,
          config: { ...prev, ...cleaned },
        };
      });

      const { error } = await supabase
        .from("tenant_integrations" as any)
        .upsert(rows, { onConflict: "organisation_id,integration_type" });

      if (error) throw error;
      toast.success("Integrations saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const setVal = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));
  const toggleSecret = (id: string) => setShowSecrets((p) => ({ ...p, [id]: !p[id] }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle>Customer Integrations</CardTitle>
        {orgId && onViewMessaging && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onViewMessaging(orgId)}
          >
            View message status
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label>Tenant</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a tenant..." />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name} <span className="text-muted-foreground">({o.slug})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
          </div>
        )}

        {orgId && !loading && (
          <>
            {SECTIONS.map((section, idx) => (
              <div key={section.title} className="space-y-4">
                {idx > 0 && <Separator />}
                <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                <div className="space-y-3">
                  {section.fields.map((f) => {
                    const id = fieldId(f);
                    const isSecret = !!f.secret;
                    const reveal = showSecrets[id];
                    return (
                      <div key={id} className="space-y-1.5">
                        <Label htmlFor={id}>{f.label}</Label>
                        <div className="flex gap-2">
                          <Input
                            id={id}
                            type={isSecret && !reveal ? "password" : "text"}
                            value={values[id] ?? ""}
                            onChange={(e) => setVal(id, e.target.value)}
                            placeholder={f.placeholder}
                            autoComplete="off"
                          />
                          {isSecret && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => toggleSecret(id)}
                              aria-label={reveal ? "Hide" : "Show"}
                            >
                              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {f.help && (
                          <p className="text-xs text-muted-foreground">{f.help}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Integrations"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
