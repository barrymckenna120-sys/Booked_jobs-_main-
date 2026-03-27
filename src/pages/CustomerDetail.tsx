import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, Loader2, PhoneOff, MessageCircle, CheckCircle2, CalendarCheck, Wallet, History } from "lucide-react";
import CustomerHistoryPanel from "@/components/customer/CustomerHistoryPanel";
import WhatsAppHistory from "@/components/whatsapp/WhatsAppHistory";
import ServiceHistory from "@/components/customer/ServiceHistory";
import CustomerHazardNotices from "@/components/customer/CustomerHazardNotices";
import CustomerQuotes from "@/components/customer/CustomerQuotes";
import PaymentHistory from "@/components/customer/PaymentHistory";
import SendReminderModal from "@/components/whatsapp/SendReminderModal";
import DeleteCustomerModal from "@/components/customer/DeleteCustomerModal";
import { useLastCompletedService } from "@/hooks/useLastCompletedService";
import CustomerFormField from "@/components/shared/CustomerFormField";
import {
  validateRequired, validatePhone, validateEircode, validateAreaCode,
  formatEircode, formatPhoneInternational, normalizeAreaCode, RED_BORDER, type CustomerFieldErrors,
} from "@/lib/customerValidation";

const formatDateForInput = (val: string | null) => val || "";

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { registerGuard, guardedNavigate } = useNavigationGuard();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [originalForm, setOriginalForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<CustomerFieldErrors>({});
  const [showSendModal, setShowSendModal] = useState(false);
  const { data: lastService } = useLastCompletedService(id);
  const [showHistory, setShowHistory] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Dirty check
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm);

  // Register navigation guard — blocks sidebar/nav clicks when dirty
  const isDirtyRef = useCallback(() => isDirty, [isDirty]);
  useEffect(() => {
    const unregister = registerGuard(isDirtyRef);
    return unregister;
  }, [registerGuard, isDirtyRef]);

  useEffect(() => {
    if (user?.id && id) {
      fetchCustomer();
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) setSettings(data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  const fetchCustomer = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Customer not found", variant: "destructive" });
      navigate("/dashboard");
      return;
    }
    setForm(data);
    setOriginalForm(data);
    setLoading(false);
  };

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  const blurField = (field: string) => {
    const val = String(form[field] ?? "");
    let err: string | null = null;
    if (field === "name") err = validateRequired(val);
    else if (field === "phone") err = validatePhone(val);
    else if (field === "eircode") {
      err = validateEircode(val);
      if (!err) handleChange("eircode", formatEircode(val));
    } else if (field === "area_code") err = validateAreaCode(val);
    if (err) setErrors((e) => ({ ...e, [field]: err! }));
  };

  const validateAll = (): boolean => {
    const e: CustomerFieldErrors = {};
    const nameErr = validateRequired(String(form.name ?? "")); if (nameErr) e.name = nameErr;
    const phoneErr = validatePhone(String(form.phone ?? "")); if (phoneErr) e.phone = phoneErr;
    const eircodeErr = validateEircode(String(form.eircode ?? "")); if (eircodeErr) e.eircode = eircodeErr;
    const areaErr = validateAreaCode(String(form.area_code ?? "")); if (areaErr) e.area_code = areaErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validateAll()) return;
    setSaving(true);
    const { id: _id, created_at, updated_at, user_id, ...updates } = form;
    // Clean phone & eircode
    if (updates.phone) updates.phone = formatPhoneInternational(updates.phone);
    if (updates.eircode) updates.eircode = formatEircode(updates.eircode);
    if (updates.area_code) updates.area_code = normalizeAreaCode(updates.area_code);
    // Ensure required fields are never null
    if (!updates.eircode && updates.eircode !== undefined) updates.eircode = "";
    if (!updates.address && updates.address !== undefined) updates.address = "";
    const { error } = await supabase.from("customers").update(updates).eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer saved" });
      setOriginalForm({ ...form });
    }
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer deleted" });
      navigate("/dashboard");
    }
  };

  const handleBackButton = () => {
    guardedNavigate("/dashboard");
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Generic field for non-validated fields
  const PlainField = ({ label, field, type = "text", value }: { label: string; field: string; type?: string; value: any }) => (
    <div className="space-y-1.5">
      <Label htmlFor={field} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={field}
        type={type}
        value={type === "date" ? formatDateForInput(value) : (value ?? "")}
        onChange={(e) => handleChange(field, e.target.value || (type === "date" ? null : ""))}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBackButton}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{form.name}</h1>
              <Badge variant={form.service_status === "Overdue" ? "destructive" : form.service_status === "Due Soon" ? "secondary" : "default"} className="mt-0.5">
                {form.service_status || "Up to Date"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span className="hidden sm:inline ml-1">Save</span>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteModal(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contact Information</CardTitle>
              <Button
                variant={showHistory ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-3.5 h-3.5" /> History
              </Button>
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent className="border-b border-border pb-4 mb-0">
              <CustomerHistoryPanel customerId={id!} customer={form} />
            </CardContent>
          )}
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CustomerFormField label="Customer Name" id="name" value={form.name ?? ""} onChange={(v) => handleChange("name", v)} onBlur={() => blurField("name")} error={errors.name} required maxLength={100} />
            <CustomerFormField label="Mobile Number" id="phone" value={form.phone ?? ""} onChange={(v) => handleChange("phone", v)} onBlur={() => blurField("phone")} error={errors.phone} required maxLength={30} placeholder="083 123 4567" />
            <PlainField label="Email" field="email" value={form.email} />
            <PlainField label="Address" field="address" value={form.address} />
            <CustomerFormField label="Eircode" id="eircode" value={form.eircode ?? ""} onChange={(v) => handleChange("eircode", v)} onBlur={() => blurField("eircode")} error={errors.eircode} required maxLength={10} placeholder="D01 X2Y3" />
            <CustomerFormField label="Area Code" id="area_code" value={form.area_code ?? ""} onChange={(v) => handleChange("area_code", v)} onBlur={() => blurField("area_code")} error={errors.area_code} maxLength={10} placeholder="01" />
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-input px-3 py-2.5">
              <div>
                <Label htmlFor="opted_out" className="text-sm font-medium text-foreground">Opt out of service reminders</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">This customer won't receive automated renewal reminders</p>
              </div>
              <Switch
                id="opted_out"
                checked={!!form.opted_out}
                onCheckedChange={(v) => handleChange("opted_out", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Boiler Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Boiler Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlainField label="Boiler Make / Model" field="boiler_make_model" value={form.boiler_make_model} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Boiler Type</Label>
              <Select value={form.boiler_type || ""} onValueChange={(v) => handleChange("boiler_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gas">Gas</SelectItem>
                  <SelectItem value="Oil">Oil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PlainField label="Installation Date" field="boiler_installation_date" type="date" value={form.boiler_installation_date} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Under Warranty</Label>
              <Select value={form.under_warranty === true ? "Yes" : form.under_warranty === false ? "No" : ""} onValueChange={(v) => handleChange("under_warranty", v === "Yes")}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Service Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last Service Date</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground items-center">
                {lastService?.date || "No previous service"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last Service Engineer</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground items-center">
                {lastService?.engineerName || "—"}
              </div>
            </div>
            <PlainField label="Next Service Due" field="next_service_due" type="date" value={form.next_service_due} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service Status</Label>
              <Select value={form.service_status || "Up to Date"} onValueChange={(v) => handleChange("service_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Up to Date">Up to Date</SelectItem>
                  <SelectItem value="Due Soon">Due Soon</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Renewal Stage</Label>
              <Select value={form.renewal_stage || "not_contacted"} onValueChange={(v) => handleChange("renewal_stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_contacted">
                    <span className="flex items-center gap-1.5"><PhoneOff className="w-3.5 h-3.5 text-destructive" /> Not Contacted</span>
                  </SelectItem>
                  <SelectItem value="reminded">
                    <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-warning" /> Reminded</span>
                  </SelectItem>
                  <SelectItem value="confirmed">
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#0891B2]" /> Confirmed</span>
                  </SelectItem>
                  <SelectItem value="booked">
                    <span className="flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5 text-primary" /> Booked In</span>
                  </SelectItem>
                  <SelectItem value="paid">
                    <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-success" /> Paid</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PlainField label="Assigned Engineer" field="assigned_engineer" value={form.assigned_engineer} />
            <PlainField label="Customer Since" field="customer_since" type="date" value={form.customer_since} />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Access Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.access_notes ?? ""}
                onChange={(e) => handleChange("access_notes", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Engineer Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.engineer_notes ?? ""}
                onChange={(e) => handleChange("engineer_notes", e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Customer Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={form.notes ?? ""}
                onChange={(e) => handleChange("notes", e.target.value || null)}
              />
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp History */}
        {id && (
          <WhatsAppHistory
            customerId={id}
            onSendMessage={() => setShowSendModal(true)}
          />
        )}

        {/* Payment History */}
        {id && <PaymentHistory customerId={id} />}

        {/* Quotes */}
        {id && <CustomerQuotes customerId={id} />}

        {/* Service History */}
        {id && <ServiceHistory customerId={id} />}
      </div>

      {/* Delete Customer Modal */}
      <DeleteCustomerModal
        open={showDeleteModal}
        customerName={form.name || ""}
        onConfirm={() => { setShowDeleteModal(false); handleDelete(); }}
        onCancel={() => setShowDeleteModal(false)}
      />

      {/* Send Reminder Modal */}
      {showSendModal && form.name && (
        <SendReminderModal
          customer={{ id: id!, name: form.name, phone: form.phone, next_service_due: form.next_service_due }}
          settings={settings}
          open={showSendModal}
          onClose={() => setShowSendModal(false)}
          onSent={() => {}}
        />
      )}
    </div>
  );
};

export default CustomerDetail;
