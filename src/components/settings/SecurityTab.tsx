import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldAlert, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgId } from "@/hooks/useOrgId";

const SecurityTab = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useUserRole(user);
  const { orgId, ready: orgReady } = useOrgId();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  // Clear Auth Block state
  const [blockEmail, setBlockEmail] = useState("");
  const [clearing, setClearing] = useState(false);

  // Test data reset state
  const [org, setOrg] = useState<{ id: string; name: string; is_test: boolean } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [resetting, setResetting] = useState(false);
  // Ref guard: React state updates are async, so two clicks landing in the same
  // tick would both pass an `if (resetting)` check. A ref flips synchronously.
  const resettingRef = useRef(false);

  useEffect(() => {
    if (!orgReady || !orgId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organisations")
        .select("id, name, is_test")
        .eq("id", orgId)
        .maybeSingle();
      if (!cancelled && data) {
        setOrg({
          id: (data as any).id,
          name: (data as any).name ?? "",
          is_test: (data as any).is_test === true,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, orgReady]);

  const handleResetTestData = async () => {
    if (!org) return;
    if (resettingRef.current) return;
    if (!org.is_test) {
      toast({
        title: "Not a test account",
        description: "Data deletion is only available on test accounts.",
        variant: "destructive",
      });
      return;
    }
    resettingRef.current = true;
    setResetting(true);
    try {
      // Send the org shown in the dialog. The backend still ignores this for
      // non-superadmins and re-checks is_test, so this can only narrow scope.
      const { data, error } = await invokeFunction("reset-org-data", {
        body: { organisation_id: org.id },
      });

      let message: string | null = null;
      if (error) {
        const ctx: any = (error as any).context;
        try {
          const body = await (ctx?.json?.() ?? ctx?.response?.json?.());
          message = body?.error ?? null;
        } catch {
          message = null;
        }
        throw new Error(message || error.message || "Reset failed");
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      const total = (data as any)?.total_deleted ?? 0;
      const unresolved = ((data as any)?.unresolved ?? []) as unknown[];
      toast({
        title: "Test data deleted",
        description:
          `${total} record${total === 1 ? "" : "s"} removed from ${org.name}.` +
          (unresolved.length
            ? ` ${unresolved.length} media file${unresolved.length === 1 ? "" : "s"} could not be removed from storage.`
            : ""),
      });
      setResetOpen(false);
      setConfirmName("");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      toast({
        title: "Failed to delete test data",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };


  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPw.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated successfully" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  };

  const handleClearAuthBlock = async () => {
    if (!blockEmail.trim()) {
      toast({ title: "Please enter an email", variant: "destructive" });
      return;
    }
    setClearing(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-auth-block", {
        body: { email: blockEmail.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Auth block cleared", description: `Successfully cleared for ${blockEmail}` });
      setBlockEmail("");
    } catch (err: any) {
      toast({ title: "Failed to clear block", description: err.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div><Label>Current Password</Label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
          <div><Label>New Password</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
          <div><Label>Confirm New Password</Label><Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
          <Button onClick={handleChangePassword} disabled={saving || !newPw}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Clear Auth Block — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Unlock className="w-4 h-4" /> Clear Auth Block
            </CardTitle>
            <CardDescription>
              Remove authentication-level locks (banned/unconfirmed) for any team member
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div>
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={blockEmail}
                onChange={(e) => setBlockEmail(e.target.value)}
              />
            </div>
            <Button onClick={handleClearAuthBlock} disabled={clearing || !blockEmail.trim()}>
              {clearing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Clear Block
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone — admin only */}
      {isAdmin && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>These actions are destructive and cannot be undone.</AlertDescription>
            </Alert>
            <Button
              variant="destructive"
              size="sm"
              disabled={!org || !org.is_test}
              onClick={() => { setConfirmName(""); setResetOpen(true); }}
            >
              Delete All Test Data
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {!orgReady || !org
                ? "Checking this account…"
                : org.is_test
                  ? "Permanently deletes every job, customer, quote, invoice, payment, certificate, message and media file for this test account. Your login, team, settings and price list are kept."
                  : "Only available on test accounts. This is a live account, so data deletion is disabled."}
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setConfirmName(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete all test data?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This permanently deletes all jobs, customers, quotes, invoices, payments,
                  certificates, parts requests, messages, notifications and media belonging to{" "}
                  <strong>{org?.name}</strong>. It cannot be undone.
                </p>
                <p>
                  Your account, logins, team members, settings, branding and price list are kept.
                </p>
                <p>
                  Type <strong>{org?.name}</strong> to confirm.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={org?.name ?? ""}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting || confirmName.trim() !== (org?.name ?? "").trim()}
              onClick={(e) => { e.preventDefault(); handleResetTestData(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default SecurityTab;
