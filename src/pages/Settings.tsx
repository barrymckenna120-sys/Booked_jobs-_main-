import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const Settings = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleExport = async () => {
    toast({ title: "Exporting...", description: "Fetching customer data." });
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");

    if (error) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
      return;
    }

    const rows = (data || []).map((c) => ({
      "Customer Name": c.name,
      "Phone Number": c.phone,
      Email: c.email,
      Address: c.address,
      Eircode: c.eircode,
      "Area Code": c.area_code,
      "Access Notes": c.access_notes,
      "Boiler Make / Model": c.boiler_make_model,
      "Boiler Type": c.boiler_type,
      "Installation Date": c.boiler_installation_date,
      "Under Warranty": c.under_warranty ? "Yes" : "No",
      "Last Service Date": c.last_service_date,
      "Last Service Engineer": c.last_service_engineer,
      "Engineer Notes": c.engineer_notes,
      "Next Service Due": c.next_service_due,
      "Service Status": c.service_status,
      "Assigned Engineer": c.assigned_engineer,
      "Customer Notes": c.notes,
      "Customer Since": c.customer_since,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const date = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `karls_gas_customers_export_${date}.xlsx`);
    toast({ title: "Export complete", description: `${rows.length} customers exported.` });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Data Import / Export</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Import Customers
                </CardTitle>
                <CardDescription>
                  Bulk-import or update customer records from Excel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => navigate("/settings/import")}>
                  Go to Import Page →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="w-4 h-4" /> Export Customers
                </CardTitle>
                <CardDescription>
                  Download all customers as an Excel file.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={handleExport}>
                  Export to Excel →
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Account</h2>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Signed in as</p>
              <p className="font-medium">{user?.email}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
