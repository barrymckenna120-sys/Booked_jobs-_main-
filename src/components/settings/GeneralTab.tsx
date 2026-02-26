import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const GeneralTab = ({ settings, onSave, saving }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    business_phone: "",
    business_email: "",
    website: "",
    vat_number: "",
    business_address: "",
    invoice_prefix: "K",
    next_invoice_number: 1,
    payment_terms: "30_days",
    default_service_price: 120,
    default_repair_price: 0,
    default_emergency_price: 150,
    google_review_url: "",
  });

  useEffect(() => {
    if (settings) {
      setForm((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(settings).filter(([k]) => k in prev && settings[k] != null)
        ),
      }));
      setLogoUrl(settings.logo_url || null);
    }
  }, [settings]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${settings?.user_id || "logo"}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("business-logos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("business-logos")
        .getPublicUrl(path);

      const url = publicUrlData.publicUrl;
      setLogoUrl(url);
      await onSave({ ...form, logo_url: url });
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    setLogoUrl(null);
    await onSave({ ...form, logo_url: null });
    toast({ title: "Logo removed" });
  };

  return (
    <div className="space-y-6">
      {/* Logo Upload */}
      <Card>
        <CardHeader><CardTitle className="text-base">Business Logo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {logoUrl ? (
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="Business logo" className="h-16 w-auto max-w-[200px] object-contain rounded-lg border border-border p-1" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                  Replace
                </Button>
                <Button variant="outline" size="sm" onClick={handleRemoveLogo}>
                  <X className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Logo
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          <p className="text-xs text-muted-foreground">Appears on quotes sent to customers. Max 2MB, PNG or JPG recommended.</p>
        </CardContent>
      </Card>

      {/* Business Information */}
      <Card>
        <CardHeader><CardTitle className="text-base">Business Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Business Name</Label><Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="Karl's Gas" /></div>
            <div><Label>Owner Name</Label><Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} placeholder="Karl O'Brien" /></div>
            <div><Label>Business Phone</Label><Input value={form.business_phone} onChange={(e) => set("business_phone", e.target.value)} placeholder="+353 87 100 0000" /></div>
            <div><Label>Business Email</Label><Input value={form.business_email} onChange={(e) => set("business_email", e.target.value)} placeholder="info@karls.ie" /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://karls.ie" /></div>
            <div><Label>VAT Number</Label><Input value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="IE1234567T" /></div>
          </div>
          <div><Label>Business Address</Label><Textarea value={form.business_address} onChange={(e) => set("business_address", e.target.value)} placeholder="Enter your business address" rows={3} /></div>
        </CardContent>
      </Card>

      {/* Invoice Settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Invoice Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Invoice Prefix</Label><Input value={form.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} placeholder="K" /><p className="text-xs text-muted-foreground mt-1">Generates {form.invoice_prefix}-0001, {form.invoice_prefix}-0002, etc.</p></div>
            <div><Label>Next Invoice Number</Label><Input type="number" value={form.next_invoice_number} onChange={(e) => set("next_invoice_number", parseInt(e.target.value) || 1)} min={1} /></div>
            <div>
              <Label>Payment Terms</Label>
              <Select value={form.payment_terms} onValueChange={(v) => set("payment_terms", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7_days">7 days</SelectItem>
                  <SelectItem value="14_days">14 days</SelectItem>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="due_on_completion">Due on completion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><Label>Default — Boiler Service (€)</Label><Input type="number" value={form.default_service_price} onChange={(e) => set("default_service_price", parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Default — Repair (€)</Label><Input type="number" value={form.default_repair_price} onChange={(e) => set("default_repair_price", parseFloat(e.target.value) || 0)} /><p className="text-xs text-muted-foreground mt-1">0 = variable pricing</p></div>
            <div><Label>Default — Emergency (€)</Label><Input type="number" value={form.default_emergency_price} onChange={(e) => set("default_emergency_price", parseFloat(e.target.value) || 0)} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Google Review Link */}
      <Card>
        <CardHeader><CardTitle className="text-base">Google Review Link</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label>Google Review URL</Label>
          <div className="flex gap-2">
            <Input value={form.google_review_url} onChange={(e) => set("google_review_url", e.target.value)} placeholder="https://g.page/r/your-business/review" className="flex-1" />
            <Button variant="outline" size="icon" onClick={() => {
              navigator.clipboard.writeText(form.google_review_url);
              toast({ title: "Copied!", description: "Review link copied to clipboard." });
            }}><Copy className="w-4 h-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">This link is sent to customers automatically 2 hours after job completion via WhatsApp</p>
        </CardContent>
      </Card>

      <Button onClick={() => onSave({ ...form, logo_url: logoUrl })} disabled={saving} className="w-full md:w-auto">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save General Settings
      </Button>
    </div>
  );
};

export default GeneralTab;
