import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const RemindersTab = ({ settings, onSave, saving }: Props) => {
  const [form, setForm] = useState({
    renewal_reminder_days_1: 30,
    renewal_reminder_days_2: 7,
    renewal_reminders_enabled: true,
    review_request_hours: 2,
    review_requests_enabled: true,
    payment_reminder_days_1: 7,
    payment_reminder_days_2: 14,
    payment_reminders_enabled: true,
    delivery_failure_alerts_enabled: true,
    delivery_failure_alert_mode: "immediate",
    delivery_failure_alert_email: "",
    delivery_alerts_quotes: true,
    delivery_alerts_invoices: true,
    delivery_alerts_receipts: false,
    delivery_alerts_service_reminders: false,
  });

  useEffect(() => {
    if (settings) {
      setForm((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(settings).filter(([k]) => k in prev && settings[k] != null)
        ),
      }));
    }
  }, [settings]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-6">
      {/* Renewal Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Renewal Reminders</CardTitle>
              <CardDescription>Automatically remind customers when their service is due</CardDescription>
            </div>
            <Switch checked={form.renewal_reminders_enabled} onCheckedChange={(v) => set("renewal_reminders_enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>First reminder (days before due date)</Label>
              <Input type="number" value={form.renewal_reminder_days_1} onChange={(e) => set("renewal_reminder_days_1", parseInt(e.target.value) || 30)} min={1} disabled={!form.renewal_reminders_enabled} />
            </div>
            <div>
              <Label>Second reminder (days before due date)</Label>
              <Input type="number" value={form.renewal_reminder_days_2} onChange={(e) => set("renewal_reminder_days_2", parseInt(e.target.value) || 7)} min={1} disabled={!form.renewal_reminders_enabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Requests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Review Requests</CardTitle>
              <CardDescription>Send Google review link after job completion</CardDescription>
            </div>
            <Switch checked={form.review_requests_enabled} onCheckedChange={(v) => set("review_requests_enabled", v)} />
          </div>
        </CardHeader>
        <CardContent>
          <div>
            <Label>Send review request (hours after completion)</Label>
            <Input type="number" value={form.review_request_hours} onChange={(e) => set("review_request_hours", parseInt(e.target.value) || 2)} min={1} disabled={!form.review_requests_enabled} className="w-32" />
          </div>
        </CardContent>
      </Card>

      {/* Payment Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Payment Reminders</CardTitle>
              <CardDescription>Remind customers about outstanding payments</CardDescription>
            </div>
            <Switch checked={form.payment_reminders_enabled} onCheckedChange={(v) => set("payment_reminders_enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>First reminder (days after completion if unpaid)</Label>
              <Input type="number" value={form.payment_reminder_days_1} onChange={(e) => set("payment_reminder_days_1", parseInt(e.target.value) || 7)} min={1} disabled={!form.payment_reminders_enabled} />
            </div>
            <div>
              <Label>Second reminder (days after completion)</Label>
              <Input type="number" value={form.payment_reminder_days_2} onChange={(e) => set("payment_reminder_days_2", parseInt(e.target.value) || 14)} min={1} disabled={!form.payment_reminders_enabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Failed delivery alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Failed Delivery Alerts</CardTitle>
              <CardDescription>Email the office when a customer message does not get through</CardDescription>
            </div>
            <Switch
              checked={form.delivery_failure_alerts_enabled}
              onCheckedChange={(v) => set("delivery_failure_alerts_enabled", v)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Alert timing</Label>
              <Select
                value={form.delivery_failure_alert_mode}
                onValueChange={(v) => set("delivery_failure_alert_mode", v)}
                disabled={!form.delivery_failure_alerts_enabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediately</SelectItem>
                  <SelectItem value="hourly">Hourly summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Send alerts to (optional)</Label>
              <Input
                type="email"
                placeholder="office@yourcompany.ie"
                value={form.delivery_failure_alert_email}
                onChange={(e) => set("delivery_failure_alert_email", e.target.value)}
                disabled={!form.delivery_failure_alerts_enabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to alert all office and admin users.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Alert me about</Label>
            {[
              ["delivery_alerts_quotes", "Quotes"],
              ["delivery_alerts_invoices", "Invoices"],
              ["delivery_alerts_receipts", "Receipts"],
              ["delivery_alerts_service_reminders", "Service reminders"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-semibold">{label}</span>
                <Switch
                  checked={!!(form as any)[key]}
                  onCheckedChange={(v) => set(key, v)}
                  disabled={!form.delivery_failure_alerts_enabled}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(form)} disabled={saving} className="w-full md:w-auto">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Reminder Settings
      </Button>
    </div>
  );
};

export default RemindersTab;
