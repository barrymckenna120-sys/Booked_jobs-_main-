import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const DataTab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleExport = async () => {
    toast({ title: "Exporting...", description: "Fetching customer data." });
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if (error) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
      return;
    }
    const rows = (data || []).map((c) => ({
      "Customer Name": c.name, "Phone Number": c.phone, Email: c.email,
      Address: c.address, Eircode: c.eircode, "Area Code": c.area_code,
      "Boiler Make / Model": c.boiler_make_model, "Boiler Type": c.boiler_type,
      "Last Service Date": c.last_service_date, "Next Service Due": c.next_service_due,
      "Service Status": c.service_status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `customers_export_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Export complete", description: `${rows.length} customers exported.` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Import Customers</CardTitle>
          <CardDescription>Bulk-import or update customer records from Excel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate("/settings/import")}>Go to Import Page →</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4" /> Export Customers</CardTitle>
          <CardDescription>Download all customers as an Excel file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport}>Export to Excel →</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataTab;
