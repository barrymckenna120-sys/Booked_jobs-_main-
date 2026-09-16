import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx-js-style";
import {
  cleanText,
  formatAreaCodeForExport,
  formatBoilerMakeModel,
  formatDateForExport,
  formatEircodeForExport,
  formatIdentifierForExport,
  formatPhoneForExport,
  formatServiceStatusForExport,
} from "@/lib/customerExportFormat";

const TEXT_COLUMNS = ["Phone Number", "Eircode", "GPRN", "Area Code"];

const DataTab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleExport = async () => {
    toast({ title: "Exporting...", description: "Fetching customer data." });
    const { data, error } = await supabase.from("customers").select("*").eq("is_archived", false).order("name");
    if (error) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: "No customers", description: "There are no customers to export.", variant: "destructive" });
      return;
    }
    const rows = data.map((c) => ({
      "Customer Name": cleanText(c.name),
      "Phone Number": formatPhoneForExport(c.phone),
      "Email": cleanText(c.email),
      "Address": cleanText(c.address),
      "Eircode": formatEircodeForExport(c.eircode),
      "Area Code": formatAreaCodeForExport(c.area_code),
      "GPRN": formatIdentifierForExport((c as any).gprn),
      "Access Notes": cleanText(c.access_notes),
      "Boiler Make / Model": formatBoilerMakeModel(c.boiler_make_model, (c as any).boiler_brand, (c as any).boiler_model),
      "Boiler Type": cleanText(c.boiler_type),
      "Installation Date": formatDateForExport(c.boiler_installation_date),
      "Under Warranty": c.under_warranty === true ? "Yes" : c.under_warranty === false ? "No" : "",
      "Last Service Date": formatDateForExport(c.last_service_date),
      "Last Service Engineer": cleanText(c.last_service_engineer),
      "Engineer Notes": cleanText(c.engineer_notes),
      "Next Service Due": formatDateForExport(c.next_service_due),
      "Service Status": formatServiceStatusForExport(c.service_status),
      "Assigned Engineer": cleanText(c.assigned_engineer),
      "Customer Notes": cleanText(c.notes),
      "Customer Since": formatDateForExport(c.customer_since),
    }));
    const headers = Object.keys(rows[0]);
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    // Force identifier columns to text cells so Excel cannot strip "+",
    // leading zeros, or convert them to numbers/scientific notation.
    headers.forEach((header, colIdx) => {
      if (!TEXT_COLUMNS.includes(header)) return;
      for (let rowIdx = 1; rowIdx <= rows.length; rowIdx++) {
        const ref = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx });
        const cell = ws[ref];
        if (!cell) continue;
        cell.t = "s";
        cell.v = String(cell.v ?? "");
        cell.z = "@";
      }
    });
    ws["!cols"] = [
      { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 10 },
      { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 14 },
      { wch: 20 }, { wch: 32 }, { wch: 16 },
    ];
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
