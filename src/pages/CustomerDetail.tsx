import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const formatDateForInput = (val: string | null) => val || "";

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (user && id) fetchCustomer();
  }, [user, id]);

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
    setLoading(false);
  };

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { id: _id, created_at, updated_at, user_id, ...updates } = form;
    const { error } = await supabase.from("customers").update(updates).eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer saved" });
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

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const Field = ({ label, field, type = "text" }: { label: string; field: string; type?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={field} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={field}
        type={type}
        value={type === "date" ? formatDateForInput(form[field]) : (form[field] ?? "")}
        onChange={(e) => handleChange(field, e.target.value || null)}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete customer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {form.name}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer Name" field="name" />
            <Field label="Phone Number" field="phone" />
            <Field label="Email" field="email" />
            <Field label="Address" field="address" />
            <Field label="Eircode" field="eircode" />
            <Field label="Area Code" field="area_code" />
          </CardContent>
        </Card>

        {/* Boiler Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Boiler Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Boiler Make / Model" field="boiler_make_model" />
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
            <Field label="Installation Date" field="boiler_installation_date" type="date" />
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
            <Field label="Last Service Date" field="last_service_date" type="date" />
            <Field label="Last Service Engineer" field="last_service_engineer" />
            <Field label="Next Service Due" field="next_service_due" type="date" />
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
            <Field label="Assigned Engineer" field="assigned_engineer" />
            <Field label="Customer Since" field="customer_since" type="date" />
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
      </div>
    </div>
  );
};

export default CustomerDetail;
