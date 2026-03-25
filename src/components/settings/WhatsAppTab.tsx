import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Loader2, RotateCcw } from "lucide-react";

interface Props {
  settings: any;
  onSave: (fields: Record<string, any>) => Promise<void>;
  saving: boolean;
}

const TEMPLATES = [
  {
    key: "template_booking_confirmation",
    name: "Booking Confirmation",
    description: "Sent immediately when a job is created and 'Send confirmation' is toggled on",
    variables: ["{{name}}", "{{date}}", "{{time_block}}", "{{engineer}}", "{{phone}}", "{{address}}"],
    defaultBody: `Hi {{name}}, your boiler service is booked with Karl's Gas 🔥

📅 {{date}}
⏰ {{time_block}}
👷 Engineer: {{engineer}}

We'll be in touch if anything changes. See you then!

Karl's Gas
{{phone}}`,
  },
  {
    key: "template_renewal_reminder",
    name: "Renewal Reminder",
    description: "Sent 30 days before next_service_date",
    variables: ["{{name}}", "{{due_date}}", "{{phone}}", "{{last_service_date}}"],
    defaultBody: `Hi {{name}}, it's Karl's Gas 🔥

Your annual boiler service is due on {{due_date}}.

Regular servicing keeps your boiler efficient, safe and your warranty valid.

Reply to book your service or call us on {{phone}}.

Karl's Gas`,
  },
  {
    key: "template_review_request",
    name: "Review Request",
    description: "Sent 2 hours after job_status = completed",
    variables: ["{{name}}", "{{review_link}}", "{{engineer}}", "{{phone}}"],
    defaultBody: `Hi {{name}}, thanks for having us today! 🙏

If you're happy with the service, a quick Google review would mean a lot to us —

→ {{review_link}}

Thanks again,
Karl's Gas 🔥`,
  },
  {
    key: "template_quote_sent",
    name: "Quote Message",
    description: "Sent when office clicks Send Quote via WhatsApp",
    variables: ["{{name}}", "{{ref}}", "{{job_type}}", "{{parts}}", "{{labour}}", "{{amount}}", "{{phone}}"],
    defaultBody: `Hi {{name}}, here is your quote from Karl's Gas 🔥

Quote Ref: {{ref}}

Job: {{job_type}}

Breakdown:
• Parts: €{{parts}}
• Labour: €{{labour}}
• Total: €{{amount}}

To accept this quote, simply reply *YES* to this message.

This quote is valid for 14 days from today.

Karl's Gas
📞 {{phone}}`,
  },
  {
    key: "template_payment_link",
    name: "Payment Link",
    description: "Sent when engineer selects 'Send Payment Link' on completion",
    variables: ["{{name}}", "{{amount}}", "{{payment_link}}", "{{phone}}"],
    defaultBody: `Hi {{name}}, thanks for having us today!

Your invoice for €{{amount}} is ready:
→ {{payment_link}}

Karl's Gas
{{phone}}`,
  },
  {
    key: "template_certificate",
    name: "Gas Service Certificate",
    description: "Sent when a gas safety certificate is generated and shared via WhatsApp",
    variables: ["{{customer_name}}", "{{certificate_number}}", "{{certificate_url}}"],
    defaultBody: `Hi {{customer_name}}, please find your Gas Service Certificate {{certificate_number}} from K & N Gas Services Limited.

This certificate confirms all work has been completed in accordance with Irish gas safety standards.

Please keep this for your records.

Thank you for choosing us. 🔧

📄 View Certificate:
{{certificate_url}}`,
  },
];

const WhatsAppTab = ({ settings, onSave, saving }: Props) => {
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [footer, setFooter] = useState("K&N Gas Services");

  useEffect(() => {
    if (settings) {
      const init: Record<string, string> = {};
      TEMPLATES.forEach((t) => {
        init[t.key] = settings[t.key] || t.defaultBody;
      });
      setTemplates(init);
      setFooter(settings.message_footer || "K&N Gas Services");
    }
  }, [settings]);

  const insertVariable = (key: string, variable: string) => {
    setTemplates((prev) => ({
      ...prev,
      [key]: (prev[key] || "") + variable,
    }));
  };

  return (
    <div className="space-y-6">
      <Alert>
        <MessageCircle className="w-4 h-4" />
        <AlertDescription>
          These messages are sent automatically via WhatsApp. Variables like <code className="bg-muted px-1 rounded text-xs">{"{{name}}"}</code> and <code className="bg-muted px-1 rounded text-xs">{"{{date}}"}</code> are replaced automatically when the message is sent.
        </AlertDescription>
      </Alert>

      {TEMPLATES.map((t) => (
        <Card key={t.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.name}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={templates[t.key] || ""}
              onChange={(e) => setTemplates((p) => ({ ...p, [t.key]: e.target.value }))}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {t.variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 text-xs"
                  onClick={() => insertVariable(t.key, v)}
                >
                  {v}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onSave({ [t.key]: templates[t.key] })}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />} Save Template
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTemplates((p) => ({ ...p, [t.key]: t.defaultBody }))}
              >
                <RotateCcw className="w-3 h-3 mr-1.5" /> Reset to Default
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WhatsAppTab;
