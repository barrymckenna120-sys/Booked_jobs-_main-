import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";

const DataTab = () => {
  const navigate = useNavigate();

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
          <CardDescription>Choose customers, preview the rows, then download the Excel file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate("/settings/export")}>Export Customers →</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataTab;
