import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt } from "lucide-react";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const ReceiptsTab = ({ settings, onSave, saving }: Props) => {
  const [showBoilerDetails, setShowBoilerDetails] = useState(true);

  useEffect(() => {
    if (settings) {
      setShowBoilerDetails(settings.receipt_show_boiler_details !== false);
    }
  }, [settings]);

  const handleSave = () => {
    onSave({ receipt_show_boiler_details: showBoilerDetails });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Receipts</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Control what appears on the receipts your customers receive.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="w-4 h-4" />
            Receipt Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="receipt_show_boiler_details" className="text-sm font-semibold">
                Show boiler details and notes
              </Label>
              <p className="text-sm text-muted-foreground">
                When on, the customer-facing receipt page and the PDF receipt include the boiler
                details (make &amp; model, warranty, next service due, GPRN) and any customer-facing
                notes on the job.
              </p>
            </div>
            <Switch
              id="receipt_show_boiler_details"
              checked={showBoilerDetails}
              onCheckedChange={setShowBoilerDetails}
            />
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceiptsTab;
