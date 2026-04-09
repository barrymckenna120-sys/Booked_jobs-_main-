import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Mail } from "lucide-react";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const FinanceTab = ({ settings, onSave, saving }: Props) => {
  const [accountantEmail, setAccountantEmail] = useState("");

  useEffect(() => {
    if (settings) {
      setAccountantEmail(settings.accountant_email || "");
    }
  }, [settings]);

  const handleSave = () => {
    onSave({ accountant_email: accountantEmail.trim() || null });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-foreground mb-1">Finance & Reporting</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure financial reporting and export settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4" />
            Accountant Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Monthly invoice exports will be sent to this email address when you use the "Email to Accountant" feature on the Finance page.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="accountant_email" className="text-xs text-muted-foreground">
              Email Address
            </Label>
            <Input
              id="accountant_email"
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="accountant@example.com"
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

export default FinanceTab;
