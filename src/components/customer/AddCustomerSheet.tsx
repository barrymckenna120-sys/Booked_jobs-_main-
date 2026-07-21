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
  validateRequired, validatePhone, validateEircode, validateAreaCode,
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
  email: "",
  address: "",
  eircode: "",
  area_code: "",
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
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    eircode: "",
    area_code: "",
  });
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
    else if (field === "eircode") {
      err = validateEircode(val);
      if (!err) update("eircode", formatEircode(val));
    } else if (field === "area_code") err = validateAreaCode(val);
    if (err) setErrors((e) => ({ ...e, [field]: err! }));
  };

  const isDirty = Object.values(form).some((v) => v.trim() !== "");

  const validateAll = (): boolean => {
    const e: CustomerFieldErrors = {};
    const nameErr = validateRequired(form.name); if (nameErr) e.name = nameErr;
    const phoneErr = validatePhone(form.phone); if (phoneErr) e.phone = phoneErr;
    const eircodeErr = validateEircode(form.eircode); if (eircodeErr) e.eircode = eircodeErr;
    const areaErr = validateAreaCode(form.area_code); if (areaErr) e.area_code = areaErr;
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
    const nextServiceDue = new Date();
    nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
    const { error } = await supabase.from("customers").insert({
      user_id: user.id,
      organisation_id: orgId!,
      name: form.name.trim(),
      phone: cleanPhone,
      email: form.email.trim() || null,
      address: form.address.trim(),
      eircode: cleanEircode,
      area_code: form.area_code.trim() ? normalizeAreaCode(form.area_code) : null,
      next_service_due: nextServiceDue.toISOString().split("T")[0],
      renewal_stage: "none",
      service_status: "active",
    });
    setSaving(false);

    if (error) {
      toast({ title: "Failed to add customer", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer added" });
      setForm({ name: "", phone: "", email: "", address: "", eircode: "", area_code: "" });
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
    setForm({ name: "", phone: "", email: "", address: "", eircode: "", area_code: "" });
    setErrors({});
    onOpenChange(false);
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
              <CustomerFormField label="Area Code" id="area_code" value={form.area_code} onChange={(v) => update("area_code", v)} onBlur={() => blurField("area_code")} error={errors.area_code} maxLength={10} placeholder="01" />
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
    </>
  );
};

export default AddCustomerSheet;
