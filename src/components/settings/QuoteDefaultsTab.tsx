import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";

type Props = {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
};

const QuoteDefaultsTab = ({ settings, onSave, saving }: Props) => {
  const [terms, setTerms] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [deposit, setDeposit] = useState("0");
  const [depositPercentage, setDepositPercentage] = useState(50);

  useEffect(() => {
    if (settings) {
      setTerms(settings.default_terms || "");
      setExpiryDays(String(settings.default_expiry_days ?? 30));
      setVatEnabled(settings.default_vat_enabled ?? false);
      setDeposit(String(settings.default_deposit ?? 0));
      setDepositPercentage(settings.deposit_percentage ?? 50);
    }
  }, [settings]);

  const handleSave = () => {
    onSave({
      default_terms: terms.trim() || null,
      default_expiry_days: parseInt(expiryDays) || 30,
      default_vat_enabled: vatEnabled,
      default_deposit: parseFloat(deposit) || 0,
      deposit_percentage: depositPercentage,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Quote Defaults</h2>
        <p className="text-sm text-muted-foreground">Set defaults for new quotes. These can be overridden per quote.</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Default Terms & Conditions</Label>
            <Textarea
              rows={5}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="e.g. Payment due within 30 days. All prices include materials unless stated otherwise."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Quote Valid For (days)</Label>
              <Input type="number" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Default Deposit €</Label>
              <Input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Default Deposit Percentage</Label>
            <div className="relative w-32">
              <Input
                type="number"
                value={depositPercentage}
                onChange={(e) => setDepositPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                min={0}
                max={100}
                step={1}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Applied when generating quotes and payment requests.</p>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={vatEnabled} onCheckedChange={setVatEnabled} />
            <Label className="text-sm">VAT enabled by default (23%)</Label>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Quote Defaults
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuoteDefaultsTab;
