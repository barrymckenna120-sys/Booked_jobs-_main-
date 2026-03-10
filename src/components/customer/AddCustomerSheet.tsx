import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AddCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const AddCustomerSheet = ({ open, onOpenChange, onSuccess }: AddCustomerSheetProps) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    eircode: "",
    area_code: "",
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      user_id: user.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      address: form.address.trim(),
      eircode: form.eircode.trim(),
      area_code: form.area_code.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Failed to add customer", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer added" });
      setForm({ name: "", phone: "", email: "", address: "", eircode: "", area_code: "" });
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Customer</SheetTitle>
          <SheetDescription>Enter the customer's details below.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone *</Label>
            <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} required maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eircode">Eircode</Label>
              <Input id="eircode" value={form.eircode} onChange={(e) => update("eircode", e.target.value)} maxLength={10} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area_code">Area Code</Label>
              <Input id="area_code" value={form.area_code} onChange={(e) => update("area_code", e.target.value)} maxLength={10} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Add Customer"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default AddCustomerSheet;
