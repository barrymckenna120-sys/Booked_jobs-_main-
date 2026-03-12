import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const verifyToken = async () => {
      // Check for OTP token + email in query params (from custom Resend email)
      const token = searchParams.get("token");
      const email = searchParams.get("email");

      if (token && email) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "recovery",
        });
        if (otpError) {
          console.error("OTP verification failed:", otpError);
          setError("This reset link has expired or is invalid. Please request a new one.");
          setChecking(false);
          return;
        }
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Check for hash-based recovery token (from Supabase built-in flow)
      const hash = window.location.hash;
      if (hash.includes("type=recovery")) {
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Check if there's already an active session (redirected after PASSWORD_RECOVERY event)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Listen for PASSWORD_RECOVERY event as fallback
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setSessionReady(true);
        }
        setChecking(false);
      });

      // Give auth state a moment to process
      setTimeout(() => {
        setChecking(false);
      }, 3000);

      return () => subscription.unsubscribe();
    };

    verifyToken();
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        logAudit({
          action_type: "password_reset_completed",
          entity_type: "user",
          entity_id: user.id,
          detail: `Password reset completed by ${user.email}`,
          metadata: { target_email: user.email, triggered_by: "self" },
        });

        // Redirect to correct dashboard based on role
        try {
          const { data: role } = await supabase.rpc("get_user_role", { _user_id: user.id });
          const dest = role === "engineer" ? "/engineer/today" : "/dashboard";
          toast({ title: "Password updated successfully" });
          navigate(dest, { replace: true });
          return;
        } catch {}
      }

      toast({ title: "Password updated successfully" });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-md border-border/60">
          <CardHeader className="text-center space-y-3 pb-2">
            <img src={bookedJobsLogo} alt="BookedJobs" className="h-12 mx-auto rounded-lg" />
            <div>
              <CardTitle className="text-xl text-foreground">Link Expired</CardTitle>
              <CardDescription className="mt-1">{error}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 text-center">
            <Button onClick={() => navigate("/auth")} className="w-full">
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-md border-border/60">
        <CardHeader className="text-center space-y-3 pb-2">
          <img src={bookedJobsLogo} alt="BookedJobs" className="h-12 mx-auto rounded-lg" />
          <div>
            <CardTitle className="text-xl text-foreground">Set New Password</CardTitle>
            <CardDescription className="mt-1">Choose a secure password for your account</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !newPassword}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
