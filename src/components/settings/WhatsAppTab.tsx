import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Loader2, RotateCcw } from "lucide-react";

interface Props {
  settings: any;
}

const TEMPLATES = [
  {
    key: "template_booking_confirmation",
    name: "Booking Confirmation",
    description: "Sent immediately when a job is created and 'Send confirmation' is toggled on",
    variables: ["{{first_name}}", "{{job_type}}", "{{date}}", "{{time_slot}}", "{{engineer_name}}", "{{message_footer}}"],
    defaultBody: `Booking Confirmed ✅
K&N Gas Services

Hi {{first_name}}, your {{job_type}} has been booked for {{date}} between {{time_slot}}.

Your engineer {{engineer_name}} will be with you on the day. If you need to make any changes, give us a call.

Thanks,
{{message_footer}}`,
  },
  {
    key: "template_renewal_reminder",
    name: "Renewal Reminder",
    description: "Sent 30 days before next_service_date",
    variables: ["{{name}}", "{{due_date}}", "{{phone}}", "{{last_service_date}}"],
    defaultBody: `Hi {{name}}, just a friendly reminder 🔥

Your annual boiler service is due on {{due_date}}.

Regular servicing keeps your boiler efficient, safe and your warranty valid.

Reply to book your service or call us on {{phone}}.`,
  },
  {
    key: "template_review_request",
    name: "Review Request",
    description: "Sent 2 hours after job_status = completed",
    variables: ["{{name}}", "{{review_link}}", "{{engineer}}", "{{phone}}"],
    defaultBody: `Hi {{name}}, thanks for having us today! 🙏

If you're happy with the service, a quick Google review would mean a lot to us —

→ {{review_link}}

Thanks again! 🔥`,
  },
  {
    key: "template_quote_sent",
    name: "Quote Message",
    description: "Sent when office clicks Send Quote via WhatsApp",
    variables: ["{{name}}", "{{ref}}", "{{job_type}}", "{{parts}}", "{{labour}}", "{{amount}}", "{{phone}}"],
    defaultBody: `Hi {{name}}, here is your quote 🔥

Quote Ref: {{ref}}

Job: {{job_type}}

Breakdown:
• Parts: €{{parts}}
• Labour: €{{labour}}
• Total: €{{amount}}

To accept this quote, simply reply *YES* to this message.

This quote is valid for 14 days from today.

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

{{phone}}`,
  },
  {
    key: "template_certificate",
    name: "Gas Service Certificate",
    description: "Sent when a gas safety certificate is generated and shared via WhatsApp",
    variables: ["{{customer_name}}", "{{certificate_number}}", "{{certificate_url}}"],
    defaultBody: `Hi {{customer_name}}, please find your Gas Service Certificate {{certificate_number}}.

This certificate confirms all work has been completed in accordance with Irish gas safety standards.

Please keep this for your records.

Thank you for choosing us. 🔧

📄 View Certificate:
{{certificate_url}}`,
  },
];

const WhatsAppTab = ({ settings }: Props) => {
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

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          WhatsApp messages are managed centrally as approved Meta templates. Contact BookedJobs to request changes.
        </AlertDescription>
      </Alert>

      {/* Message Footer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Message Footer</CardTitle>
          <CardDescription>This text is automatically added to the bottom of all WhatsApp messages sent from the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={footer}
            readOnly
            rows={2}
            className="font-mono text-sm bg-muted cursor-default"
          />
        </CardContent>
      </Card>

      {TEMPLATES.map((t) => (
        <Card key={t.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.name}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={templates[t.key] || ""}
              readOnly
              rows={8}
              className="font-mono text-sm bg-muted cursor-default"
            />
            <div className="flex flex-wrap gap-1.5">
              {t.variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-default text-xs"
                >
                  {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default WhatsAppTab;
