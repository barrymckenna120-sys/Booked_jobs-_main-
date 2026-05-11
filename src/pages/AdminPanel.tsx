import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Owner-only access. Update if Barry's email differs.
const OWNER_EMAIL = "barrymckenna120@gmail.com";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type SuccessResult = {
  organisation_id: string;
  owner_email: string;
  slug: string;
};

type Org = { id: string; name: string; slug: string };

type IntegrationFields = {
  company_name: string;
  company_phone: string;
  api_key_secret: string;
  payment_link: string;
  renewal_form_url: string;
  new_booking_url: string;
};

const emptyIntegrations: IntegrationFields = {
  company_name: "",
  company_phone: "",
  api_key_secret: "",
  payment_link: "",
  renewal_form_url: "",
  new_booking_url: "",
};

type LogRow = {
  id: string;
  created_at: string;
  function_name: string;
  error_message: string | null;
};

const AdminPanel = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorised, setAuthorised] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Section 2 state
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationFields>(emptyIntegrations);
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  // Section 3 state
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email?.toLowerCase();
      if (cancelled) return;
      if (!email || email !== OWNER_EMAIL.toLowerCase()) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setAuthorised(true);
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const loadOrgs = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("organisations")
      .select("id, name, slug")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Failed to load tenants");
      return;
    }
    setOrgs((data as Org[]) || []);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("edge_function_logs")
      .select("id, created_at, function_name, error_message")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Failed to load activity log");
      setLoadingLogs(false);
      return;
    }
    setLogs((data as LogRow[]) || []);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    if (!authorised) return;
    loadOrgs();
    loadLogs();
  }, [authorised, loadOrgs, loadLogs]);

  useEffect(() => {
    if (!selectedOrgId) {
      setIntegrations(emptyIntegrations);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingIntegrations(true);
      const { data, error } = await (supabase as any)
        .from("tenant_integrations")
        .select("integration_type, config")
        .eq("organisation_id", selectedOrgId);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load integrations");
        setLoadingIntegrations(false);
        return;
      }
      const next: IntegrationFields = { ...emptyIntegrations };
      for (const row of (data as Array<{ integration_type: string; config: any }>) || []) {
        const cfg = row.config || {};
        if (row.integration_type === "360messenger") {
          next.company_name = cfg.company_name ?? "";
          next.company_phone = cfg.company_phone ?? "";
          next.api_key_secret = cfg.api_key_secret ?? "";
        } else if (row.integration_type === "stripe") {
          next.payment_link = cfg.payment_link ?? "";
        } else if (row.integration_type === "tally") {
          next.renewal_form_url = cfg.renewal_form_url ?? "";
          next.new_booking_url = cfg.new_booking_url ?? "";
        }
      }
      setIntegrations(next);
      setLoadingIntegrations(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  const handleSaveIntegrations = async () => {
    if (!selectedOrgId) return;
    setSavingIntegrations(true);
    try {
      const rows = [
        {
          organisation_id: selectedOrgId,
          integration_type: "360messenger",
          config: {
            company_name: integrations.company_name,
            company_phone: integrations.company_phone,
            api_key_secret: integrations.api_key_secret,
          },
        },
        {
          organisation_id: selectedOrgId,
          integration_type: "stripe",
          config: { payment_link: integrations.payment_link },
        },
        {
          organisation_id: selectedOrgId,
          integration_type: "tally",
          config: {
            renewal_form_url: integrations.renewal_form_url,
            new_booking_url: integrations.new_booking_url,
          },
        },
      ];
      const { error } = await (supabase as any)
        .from("tenant_integrations")
        .upsert(rows, { onConflict: "organisation_id,integration_type" });
      if (error) throw error;
      toast.success("Integrations saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save integrations");
    } finally {
      setSavingIntegrations(false);
    }
  };

  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setCompanyName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setSlug(slugify(e.target.value));
  };

  const resetForm = () => {
    setCompanyName("");
    setSlug("");
    setSlugTouched(false);
    setOwnerName("");
    setOwnerEmail("");
    setCompanyPhone("");
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!companyName || !slug || !ownerName || !ownerEmail || !companyPhone) {
      setError("All fields are required");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "provision-tenant",
        {
          body: {
            company_name: companyName,
            slug,
            owner_name: ownerName,
            owner_email: ownerEmail,
            company_phone: companyPhone,
          },
        }
      );

      if (fnError) {
        setError(fnError.message || "Failed to provision tenant");
        return;
      }
      if (!data?.success) {
        setError(data?.error || "Failed to provision tenant");
        return;
      }

      setSuccess({
        organisation_id: data.organisation_id,
        owner_email: data.owner_email ?? ownerEmail,
        slug: data.slug ?? slug,
      });
      loadOrgs();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked || !authorised) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner-only tools.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provision New Tenant</CardTitle>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-5 space-y-3">
                <div className="flex items-center gap-2 text-green-800 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  Tenant provisioned successfully
                </div>
                <div className="text-sm text-green-900 space-y-1">
                  <div>
                    <span className="text-green-700">Organisation ID:</span>{" "}
                    <span className="font-mono">{success.organisation_id}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Invite sent to:</span>{" "}
                    {success.owner_email}
                  </div>
                  <div>
                    <span className="text-green-700">Subdomain:</span>{" "}
                    {success.slug}.bookedjobs.ie
                  </div>
                  <div className="text-green-700 italic pt-2">
                    Owner will receive an invite email shortly.
                  </div>
                </div>
                <Button variant="outline" onClick={resetForm} className="mt-2">
                  Reset form
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    value={companyName}
                    onChange={handleCompanyNameChange}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={handleSlugChange}
                    required
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    {slug || "your-slug"}.bookedjobs.ie
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner_name">Owner Name</Label>
                  <Input
                    id="owner_name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner_email">Owner Email</Label>
                  <Input
                    id="owner_email"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_phone">Company Phone</Label>
                  <Input
                    id="company_phone"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2 text-sm text-red-800">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Provisioning…
                    </>
                  ) : (
                    "Provision Tenant"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* SECTION 2: Manage Tenant Integrations */}
        <Card>
          <CardHeader>
            <CardTitle>Manage Tenant Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="select_tenant">Select Tenant</Label>
              <select
                id="select_tenant"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Choose an organisation —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </option>
                ))}
              </select>
            </div>

            {selectedOrgId && (
              loadingIntegrations ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="i_company_name">Company Name</Label>
                    <Input
                      id="i_company_name"
                      value={integrations.company_name}
                      onChange={(e) => setIntegrations({ ...integrations, company_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i_company_phone">Company Phone</Label>
                    <Input
                      id="i_company_phone"
                      value={integrations.company_phone}
                      onChange={(e) => setIntegrations({ ...integrations, company_phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i_api_key_secret">360Messenger API Key Secret Name</Label>
                    <Input
                      id="i_api_key_secret"
                      value={integrations.api_key_secret}
                      onChange={(e) => setIntegrations({ ...integrations, api_key_secret: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Add the actual key value in Supabase → Edge Functions → Manage Secrets
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i_payment_link">Stripe Payment Link</Label>
                    <Input
                      id="i_payment_link"
                      value={integrations.payment_link}
                      onChange={(e) => setIntegrations({ ...integrations, payment_link: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i_renewal_url">Renewal Booking URL</Label>
                    <Input
                      id="i_renewal_url"
                      value={integrations.renewal_form_url}
                      onChange={(e) => setIntegrations({ ...integrations, renewal_form_url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i_new_booking_url">New Booking URL</Label>
                    <Input
                      id="i_new_booking_url"
                      value={integrations.new_booking_url}
                      onChange={(e) => setIntegrations({ ...integrations, new_booking_url: e.target.value })}
                    />
                  </div>
                  <Button
                    onClick={handleSaveIntegrations}
                    disabled={savingIntegrations}
                    className="w-full"
                  >
                    {savingIntegrations ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save Integrations"
                    )}
                  </Button>
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* SECTION 3: Activity Log */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>System Activity Log</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Last 50 Edge Function calls
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadLogs}
                disabled={loadingLogs}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLogs ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No activity yet.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
                {logs.map((log) => {
                  const hasError = !!log.error_message;
                  const msg = hasError
                    ? (log.error_message!.length > 80
                        ? log.error_message!.slice(0, 80) + "…"
                        : log.error_message!)
                    : "OK";
                  return (
                    <div
                      key={log.id}
                      className={`rounded-md border px-3 py-2 text-xs flex items-center gap-3 ${
                        hasError
                          ? "border-red-200 bg-red-50 text-red-900"
                          : "border-green-200 bg-green-50 text-green-900"
                      }`}
                    >
                      <span className="font-mono text-[11px] shrink-0 opacity-70">
                        {new Date(log.created_at).toLocaleString("en-IE", {
                          timeZone: "Europe/Dublin",
                          hour12: false,
                        })}
                      </span>
                      <span className="font-medium shrink-0">{log.function_name}</span>
                      <span className="truncate">{msg}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
