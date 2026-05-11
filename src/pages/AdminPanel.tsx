import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Owner-only access. Update if Barry's email differs.
const OWNER_EMAIL = "barry@bookedjobs.ie";

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
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
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
      </div>
    </div>
  );
};

export default AdminPanel;
