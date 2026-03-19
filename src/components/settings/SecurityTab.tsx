import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldAlert, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

const SecurityTab = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useUserRole(user);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  // Clear Auth Block state
  const [blockEmail, setBlockEmail] = useState("");
  const [clearing, setClearing] = useState(false);

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

      {/* Danger Zone */}
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
          <Button variant="destructive" size="sm" onClick={() => {
            toast({ title: "Not implemented", description: "Test data deletion is not yet available." });
          }}>
            Delete All Test Data
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Removes all jobs, customers and quotes marked as test data</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityTab;
