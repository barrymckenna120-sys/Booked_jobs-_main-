import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CustomerIntegrationsTab from "@/components/admin/CustomerIntegrationsTab";
import { toast } from "sonner";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { Loader2 } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  subscription_status: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  industry: string | null;
  created_at: string;
  owner_user_id: string | null;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const StatusBadge = ({ status }: { status: string | null }) => {
  const s = (status || "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-green-100 text-green-800 hover:bg-green-100"
      : s === "suspended"
      ? "bg-red-100 text-red-800 hover:bg-red-100"
      : s === "trial"
      ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
      : "bg-muted text-muted-foreground";
  return <Badge className={cls} variant="secondary">{status || "—"}</Badge>;
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const { setViewingOrg } = useAdminViewAs();
  const [authChecked, setAuthChecked] = useState(false);

  // form state
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // tenants
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [ownerEmails, setOwnerEmails] = useState<Record<string, string>>({});
  const [unblockingEmail, setUnblockingEmail] = useState<string | null>(null);
  const [sendingMagicLinkFor, setSendingMagicLinkFor] = useState<string | null>(null);

  // Access check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) navigate("/dashboard", { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("role" as any)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = (data as any)?.role;
      if (error || role !== "superadmin") {
        navigate("/dashboard", { replace: true });
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const loadTenants = async () => {
    setLoadingTenants(true);
    const { data } = await supabase
      .from("organisations")
      .select("id, name, slug, subscription_status, owner_name, owner_phone, industry, created_at, owner_user_id")
      .order("created_at", { ascending: false });
    const list = (data as any[]) || [];
    setTenants(list as any);
    setLoadingTenants(false);

    // Fetch owner emails via list-users edge function
    try {
      const { data: usersResp } = await supabase.functions.invoke("list-users");
      const users = (usersResp as any)?.users || [];
      const map: Record<string, string> = {};
      for (const u of users) {
        if (u?.id && u?.email) map[u.id] = u.email;
      }
      setOwnerEmails(map);
    } catch (_e) {
      // non-fatal — Unblock button will be disabled when email missing
    }
  };

  const handleUnblock = async (email: string) => {
    setUnblockingEmail(email);
    try {
      const { data, error } = await supabase.functions.invoke("reset-auth-block", {
        body: { email },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed to unblock");
      }
      toast.success("User unblocked successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unblock user");
    } finally {
      setUnblockingEmail(null);
    }
  };

  const handleSendMagicLink = async (tenantId: string, email: string, orgName: string) => {
    setSendingMagicLinkFor(tenantId);
    try {
      const { data, error } = await supabase.functions.invoke("send-magic-link", {
        body: { email, org_name: orgName },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Failed");
      }
      toast.success(`Magic link sent to ${email}`);
    } catch (_e) {
      toast.error("Failed to send magic link");
    } finally {
      setSendingMagicLinkFor(null);
    }
  };

  useEffect(() => {
    if (authChecked) loadTenants();
  }, [authChecked]);

  // Auto-slug from company name unless user has edited it
  useEffect(() => {
    if (!slugDirty) setOrgSlug(slugify(companyName));
  }, [companyName, slugDirty]);

  const resetForm = () => {
    setCompanyName("");
    setCompanyPhone("");
    setOwnerName("");
    setOwnerEmail("");
    setOrgSlug("");
    setSlugDirty(false);
    setErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setErrorMsg(null);

    const next: Record<string, string> = {};
    if (!companyName.trim()) next.company_name = "Required";
    if (!companyPhone.trim()) next.company_phone = "Required";
    if (!ownerName.trim()) next.owner_name = "Required";
    if (!ownerEmail.trim()) next.owner_email = "Required";
    if (!orgSlug.trim()) next.org_slug = "Required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-tenant`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${accessToken}`,
          "x-admin-secret": "bj-admin-2026-xK9mP3",
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          company_phone: companyPhone.trim(),
          owner_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          org_slug: orgSlug.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json?.error === "slug_taken") {
          setErrorMsg("Slug already exists — choose a different one");
        } else {
          setErrorMsg(json?.detail || json?.error || `Request failed (${res.status})`);
        }
        return;
      }
      setSuccess(
        `✅ ${companyName} provisioned. Invite sent to ${ownerEmail}. Org ID: ${json.organisation_id}`
      );
      resetForm();
      loadTenants();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <Tabs defaultValue="tenants" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="integrations">Customer Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_phone">Company Phone</Label>
              <Input
                id="company_phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="087 XXXXXXX"
              />
              {errors.company_phone && (
                <p className="text-sm text-destructive">{errors.company_phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner_name">Owner Full Name</Label>
              <Input
                id="owner_name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
              {errors.owner_name && (
                <p className="text-sm text-destructive">{errors.owner_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="owner_email">Owner Email</Label>
              <Input
                id="owner_email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
              {errors.owner_email && (
                <p className="text-sm text-destructive">{errors.owner_email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org_slug">Org Slug</Label>
              <Input
                id="org_slug"
                value={orgSlug}
                onChange={(e) => {
                  setSlugDirty(true);
                  setOrgSlug(e.target.value);
                }}
              />
              {errors.org_slug && (
                <p className="text-sm text-destructive">{errors.org_slug}</p>
              )}
            </div>

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {success}
              </div>
            )}
            {errorMsg && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {errorMsg}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTenants ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenants yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner Name</TableHead>
                    <TableHead>Owner Phone</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => {
                    const email = t.owner_user_id ? ownerEmails[t.owner_user_id] : null;
                    return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.slug}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.subscription_status} />
                      </TableCell>
                      <TableCell>{t.owner_name || "—"}</TableCell>
                      <TableCell>{t.owner_phone || "—"}</TableCell>
                      <TableCell>{t.industry || "—"}</TableCell>
                      <TableCell>
                        {new Date(t.created_at).toLocaleDateString('en-IE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setViewingOrg(t.id, t.name);
                              toast.success(`Switched to ${t.name}`);
                              navigate("/dashboard");
                            }}
                          >
                            Switch Context
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!email || unblockingEmail === email}
                            onClick={() => email && handleUnblock(email)}
                            title={email || "Owner email unavailable"}
                          >
                            {email && unblockingEmail === email ? "Unblocking…" : "Unblock"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <CustomerIntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

