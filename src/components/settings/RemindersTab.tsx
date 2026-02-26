import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

      <Button onClick={() => onSave(form)} disabled={saving} className="w-full md:w-auto">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Reminder Settings
      </Button>
    </div>
  );
};

export default RemindersTab;
