import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import SumUpIntegrationCard from "@/components/settings/SumUpIntegrationCard";


const IntegrationsTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [renewalUrl, setRenewalUrl] = useState("");
  const [newBookingUrl, setNewBookingUrl] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [stripePaymentLink, setStripePaymentLink] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const { data: eng } = await supabase
          .from("engineers")
          .select("organisation_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        const oid = eng?.organisation_id ?? null;
        setOrgId(oid);

        if (oid) {
          const { data: integrations } = await supabase
            .from("tenant_integrations")
            .select("integration_type, config")
            .eq("organisation_id", oid);

          const byType: Record<string, any> = {};
          (integrations ?? []).forEach((r: any) => { byType[r.integration_type] = r.config ?? {}; });

          setRenewalUrl(byType.tally?.renewal_form_url ?? "");
          setNewBookingUrl(byType.tally?.new_booking_url ?? "");
          setStripePaymentLink(byType.stripe?.payment_link ?? "");
          setCompanyName(byType["360messenger"]?.company_name ?? "");
          setCompanyPhone(byType["360messenger"]?.company_phone ?? "");

          const { data: settingsRow } = await supabase
            .from("settings")
            .select("google_review_url")
            .eq("organisation_id", oid)
            .maybeSingle();
          setGoogleReviewUrl(settingsRow?.google_review_url ?? "");
        }
      } catch (e: any) {
        toast({ title: "Failed to load integrations", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, toast]);

  const upsertIntegration = async (type: string, config: Record<string, any>) => {
    const { data: existing } = await supabase
      .from("tenant_integrations")
      .select("id, config")
      .eq("organisation_id", orgId!)
      .eq("integration_type", type)
      .maybeSingle();

    const merged = { ...((existing?.config as Record<string, any>) ?? {}), ...config };

    if (existing?.id) {
      const { error } = await supabase
        .from("tenant_integrations")
        .update({ config: merged })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("tenant_integrations")
        .insert({ organisation_id: orgId!, integration_type: type, config: merged });
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!orgId || !user) {
      toast({ title: "No organisation found", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertIntegration("tally", {
        renewal_form_url: renewalUrl.trim() || null,
        new_booking_url: newBookingUrl.trim() || null,
      });
      await upsertIntegration("stripe", {
        payment_link: stripePaymentLink.trim() || null,
      });
      await upsertIntegration("360messenger", {
        company_name: companyName.trim() || null,
        company_phone: companyPhone.trim() || null,
      });

      const { data: settingsRow } = await supabase
        .from("settings")
        .select("id")
        .eq("organisation_id", orgId)
        .maybeSingle();

      if (settingsRow?.id) {
        const { error } = await supabase
          .from("settings")
          .update({ google_review_url: googleReviewUrl.trim() || null, updated_at: new Date().toISOString() })
          .eq("id", settingsRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert({ user_id: user.id, organisation_id: orgId, google_review_url: googleReviewUrl.trim() || null });
        if (error) throw error;
      }

      toast({ title: "Integrations saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Integrations</h2>
        <p className="text-sm text-muted-foreground">Configure booking links, payments, reviews and WhatsApp branding for your organisation.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Booking URLs</CardTitle>
          <CardDescription>Tally form links sent to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Renewal Booking URL</Label>
            <Input value={renewalUrl} onChange={(e) => setRenewalUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">New Booking URL</Label>
            <Input value={newBookingUrl} onChange={(e) => setNewBookingUrl(e.target.value)} placeholder="https://..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Review</CardTitle>
          <CardDescription>Where customers leave reviews after a job</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Google Review URL</Label>
            <Input value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} placeholder="https://g.page/r/..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Payments</CardTitle>
          <CardDescription>Stripe checkout link for outstanding balances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Stripe Payment Link</Label>
            <Input value={stripePaymentLink} onChange={(e) => setStripePaymentLink(e.target.value)} placeholder="https://buy.stripe.com/..." />
          </div>
        </CardContent>
      </Card>

      <SumUpIntegrationCard />


      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">WhatsApp</CardTitle>
          <CardDescription>Branding used in outbound WhatsApp messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Company Name</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. K & N Gas Services" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Company Phone</Label>
            <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="e.g. 087 1234567" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || !orgId} className="w-full sm:w-auto">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Save Integrations
      </Button>
    </div>
  );
};

export default IntegrationsTab;
