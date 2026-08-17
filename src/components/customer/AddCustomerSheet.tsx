import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CustomerFormField from "@/components/shared/CustomerFormField";
import {
  validateRequired, validatePhone, validateEircode, validateAreaCode, validateLandline,
  formatEircode, formatPhoneInternational, normalizeAreaCode, type CustomerFieldErrors,
} from "@/lib/customerValidation";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

// Defaults applied on new-customer creation only. See isDirty comparison below.
const DEFAULT_BOILER_TYPE = "Gas";
const DEFAULT_OWNER_OR_TENANT = "Owner";
const DEFAULT_WARRANTY_YEARS = "10";

const EMPTY_FORM = {
  name: "",
  phone: "",
  landline_phone: "",
  email: "",
  address: "",
  eircode: "",
  area_code: "",
  gprn: "",
  boiler_type: DEFAULT_BOILER_TYPE,
  owner_or_tenant: DEFAULT_OWNER_OR_TENANT,
  warranty_years: DEFAULT_WARRANTY_YEARS,
};


interface AddCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const AddCustomerSheet = ({ open, onOpenChange, onSuccess }: AddCustomerSheetProps) => {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const [saving, setSaving] = useState(false);
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<CustomerFieldErrors>({});

  const update = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  const blurField = (field: string) => {
    const val = form[field as keyof typeof form];
    let err: string | null = null;
    if (field === "name") err = validateRequired(val);
    else if (field === "phone") err = validatePhone(val);
    else if (field === "landline_phone") err = validateLandline(val);

    else if (field === "eircode") {
      err = validateEircode(val);
      if (!err) update("eircode", formatEircode(val));
    } else if (field === "area_code") err = validateAreaCode(val);
    if (err) setErrors((e) => ({ ...e, [field]: err! }));
  };

  // A field with a default is "dirty" only once the user changes it away from that default.
  const isDirty = (Object.entries(form) as [keyof typeof form, string][]).some(([k, v]) => {
    const defaultVal = (EMPTY_FORM as Record<string, string>)[k] ?? "";
    return v.trim() !== defaultVal.trim();
  });

  const validateAll = (): boolean => {
    const e: CustomerFieldErrors = {};
    const nameErr = validateRequired(form.name); if (nameErr) e.name = nameErr;
    const phoneErr = validatePhone(form.phone); if (phoneErr) e.phone = phoneErr;
    const eircodeErr = validateEircode(form.eircode); if (eircodeErr) e.eircode = eircodeErr;
    const areaErr = validateAreaCode(form.area_code); if (areaErr) e.area_code = areaErr;
    const landlineErr = validateLandline(form.landline_phone); if (landlineErr) e.landline_phone = landlineErr;

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!validateAll()) return;

    setSaving(true);
    const cleanPhone = formatPhoneInternational(form.phone);
    const cleanEircode = formatEircode(form.eircode);

    // Duplicate check: same normalised phone within same org.
    const { data: dupe } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", cleanPhone)
      .eq("organisation_id", orgId!)
      .maybeSingle();
    if (dupe) {
      setSaving(false);
      setDuplicate({ id: dupe.id, name: dupe.name });
      return;
    }

    const nextServiceDue = new Date();
    nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
    const parsedWarranty = parseInt(form.warranty_years, 10);
    const { error } = await supabase.from("customers").insert({
      user_id: user.id,
      organisation_id: orgId!,
      name: form.name.trim(),
      phone: cleanPhone,
      landline_phone: form.landline_phone.trim() || null,

      email: form.email.trim() || null,
      address: form.address.trim(),
      eircode: cleanEircode,
      area_code: form.area_code.trim() ? normalizeAreaCode(form.area_code) : null,
      gprn: form.gprn.trim() || null,
      boiler_type: form.boiler_type || DEFAULT_BOILER_TYPE,
      owner_or_tenant: form.owner_or_tenant || DEFAULT_OWNER_OR_TENANT,
      warranty_years: Number.isFinite(parsedWarranty) ? parsedWarranty : Number(DEFAULT_WARRANTY_YEARS),
      next_service_due: nextServiceDue.toISOString().split("T")[0],
      renewal_stage: "none",
      service_status: "active",
    });
    setSaving(false);

    if (error) {
      toast({ title: "Failed to add customer", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer added" });
      setForm({ ...EMPTY_FORM });
      setErrors({});
      onOpenChange(false);
      onSuccess();
    }
  };

  const handleClose = () => {
    if (isDirty) { setShowLeaveGuard(true); return; }
    onOpenChange(false);
  };

  const doLeave = () => {
    setShowLeaveGuard(false);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    onOpenChange(false);
  };

  const updateExistingFromDuplicate = async () => {
    if (!duplicate) return;
    setSaving(true);
    const cleanPhone = formatPhoneInternational(form.phone);
    const cleanEircode = formatEircode(form.eircode);
    const parsedWarranty = parseInt(form.warranty_years, 10);
    const { error } = await supabase.from("customers").update({
      name: form.name.trim(),
      phone: cleanPhone,
      email: form.email.trim() || null,
      address: form.address.trim(),
      eircode: cleanEircode,
      area_code: form.area_code.trim() ? normalizeAreaCode(form.area_code) : null,
      gprn: form.gprn.trim() || null,
      boiler_type: form.boiler_type || DEFAULT_BOILER_TYPE,
      owner_or_tenant: form.owner_or_tenant || DEFAULT_OWNER_OR_TENANT,
      warranty_years: Number.isFinite(parsedWarranty) ? parsedWarranty : Number(DEFAULT_WARRANTY_YEARS),
    }).eq("id", duplicate.id);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to update customer", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Customer updated" });
    setDuplicate(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    onOpenChange(false);
    onSuccess();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Customer</SheetTitle>
            <SheetDescription>Enter the customer's details below.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <CustomerFormField label="Name" id="name" value={form.name} onChange={(v) => update("name", v)} onBlur={() => blurField("name")} error={errors.name} required maxLength={100} />
            <CustomerFormField label="Mobile Number" id="phone" value={form.phone} onChange={(v) => update("phone", v)} onBlur={() => blurField("phone")} error={errors.phone} required maxLength={30} placeholder="083 123 4567" />
            <CustomerFormField label="Email" id="email" value={form.email} onChange={(v) => update("email", v)} type="email" maxLength={255} />
            <CustomerFormField label="Address" id="address" value={form.address} onChange={(v) => update("address", v)} maxLength={200} />
            <div className="grid grid-cols-2 gap-3">
              <CustomerFormField label="Eircode" id="eircode" value={form.eircode} onChange={(v) => update("eircode", v)} onBlur={() => blurField("eircode")} error={errors.eircode} required maxLength={10} placeholder="D01 X2Y3" />
              <CustomerFormField label="Area Code" id="area_code" value={form.area_code} onChange={(v) => update("area_code", v)} onBlur={() => blurField("area_code")} error={errors.area_code} maxLength={10} placeholder="e.g. D14" />
            </div>
            <CustomerFormField label="GPRN" id="gprn" value={form.gprn} onChange={(v) => update("gprn", v)} maxLength={30} placeholder="Gas Point Reference Number" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Boiler Type</Label>
                <Select value={form.boiler_type} onValueChange={(v) => update("boiler_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gas">Gas</SelectItem>
                    <SelectItem value="Oil">Oil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Owner or Tenant</Label>
                <Select value={form.owner_or_tenant} onValueChange={(v) => update("owner_or_tenant", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Owner">Owner</SelectItem>
                    <SelectItem value="Tenant">Tenant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="warranty_years" className="text-xs text-muted-foreground">Warranty Years</Label>
              <Input
                id="warranty_years"
                type="number"
                min={0}
                step={1}
                value={form.warranty_years}
                onChange={(e) => update("warranty_years", e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Add Customer"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>


      <Dialog open={showLeaveGuard} onOpenChange={(o) => { if (!o) setShowLeaveGuard(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Unsaved Changes
            </DialogTitle>
            <DialogDescription className="text-sm pt-1">
              You have unsaved changes. If you leave now, your details will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="ghost" onClick={doLeave} className="order-2 sm:order-1">Leave anyway</Button>
            <Button onClick={() => setShowLeaveGuard(false)} className="order-1 sm:order-2">Stay</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicate} onOpenChange={(o) => { if (!o) setDuplicate(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Customer already exists
            </DialogTitle>
            <DialogDescription className="text-sm pt-1">
              A customer named <span className="font-semibold">"{duplicate?.name}"</span> in your organisation already has this phone number. Would you like to update their record with the details you entered, or cancel?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDuplicate(null)} className="order-2 sm:order-1" disabled={saving}>Cancel</Button>
            <Button onClick={updateExistingFromDuplicate} className="order-1 sm:order-2" disabled={saving}>
              {saving ? "Updating..." : "Update existing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AddCustomerSheet;
