import { useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { fetchProfile } from "@/lib/profileCache";
import { collectDiagnostics, screenFromRoute, type SupportApp } from "@/lib/supportDiagnostics";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which shell the report is being sent from. */
  app: SupportApp;
  /** Optional extra context, e.g. a job reference. */
  screenSuffix?: string | null;
};

/**
 * In-app support report submission (bug / feedback / question). Writes a single
 * row to support_reports; RLS scopes it to the submitter's own organisation.
 */
const ReportIssueDialog = ({ open, onOpenChange, app, screenSuffix }: Props) => {
  const location = useLocation();
  const { toast } = useToast();
  const { role, engineerName } = useUserRole();
  const [reportType, setReportType] = useState<string>("bug");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const body = message.trim();
    if (!body) {
      toast({ title: "Please describe the issue", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not signed in");
      const profile = await fetchProfile(user.id);
      const baseScreen = screenFromRoute(location.pathname);
      const screen = screenSuffix ? `${baseScreen} — ${screenSuffix}` : baseScreen;

      const { error } = await supabase.from("support_reports").insert({
        report_type: reportType,
        message: body,
        submitted_by: user.id,
        submitted_by_name:
          (profile as { display_name?: string } | null)?.display_name ||
          engineerName ||
          user.email ||
          null,
        submitted_by_role: app === "engineer" ? "Engineer" : role === "engineer" ? "Engineer" : "Office",
        app,
        screen,
        route: location.pathname + location.search,
        ...collectDiagnostics(),
      });
      if (error) throw error;
      toast({ title: "Thanks — your report has been sent" });
      setMessage("");
      setReportType("bug");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't send report",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feedback">Feedback</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-message">What happened?</Label>
            <Textarea
              id="support-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you were doing and what went wrong"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            We also attach the page you're on and basic device details (browser, screen size) to help
            us troubleshoot.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportIssueDialog;
