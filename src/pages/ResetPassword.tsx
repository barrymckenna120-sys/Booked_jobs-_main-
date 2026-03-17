import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

const parseTokensFromUrl = () => {
  // Try hash first (#access_token=...&refresh_token=...)
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);

  // Then try query params (?access_token=...&refresh_token=...)
  const queryParams = new URLSearchParams(window.location.search);

  const access_token = hashParams.get("access_token") || queryParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token") || queryParams.get("refresh_token");
  const type = hashParams.get("type") || queryParams.get("type");
  const token = queryParams.get("token");
  const token_hash = queryParams.get("token_hash") || hashParams.get("token_hash");
  const email = queryParams.get("email");

  return { access_token, refresh_token, type, token, token_hash, email };
};

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
  const { toast } = useToast();

  useEffect(() => {
    const establish = async () => {
      const { access_token, refresh_token, type, token, token_hash, email } = parseTokensFromUrl();

      // Method 1: OTP token + email (from custom Resend email)
      if (token && email) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "recovery",
        });
        if (otpError) {
          console.error("OTP verification failed:", otpError);
          setError("This link has expired or is invalid. Please request a new password reset.");
          setChecking(false);
          return;
        }
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Method 2: PKCE token_hash (mobile browsers / Supabase default email links)
      if (token_hash && type === "recovery") {
        const { error: hashError } = await supabase.auth.verifyOtp({
          token_hash,
          type: "recovery",
        });
        if (hashError) {
          console.error("token_hash verification failed:", hashError);
          setError("This link has expired or is invalid. Please request a new password reset.");
          setChecking(false);
          return;
        }
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Method 3: Explicit access_token + refresh_token in URL (fixes mobile Chrome)
      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) {
          console.error("setSession failed:", sessionError);
          setError("This link has expired or is invalid. Please request a new password reset.");
          setChecking(false);
          return;
        }
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Method 4: Hash contains type=recovery — let Supabase auto-detect
      if (type === "recovery") {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setSessionReady(true);
          setChecking(false);
          return;
        }
      }

      // Method 5: Already have a session (redirected after PASSWORD_RECOVERY event)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Fallback: listen for PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          setSessionReady(true);
          setChecking(false);
        }
      });

      // Timeout after 3s — if no session established, show error
      setTimeout(() => {
        setChecking((prev) => {
          if (prev) {
            setError("This link may have expired. Request a new one from the sign-in page.");
          }
          return false;
        });
      }, 3000);

      return () => subscription.unsubscribe();
    };

    establish();
  }, []);

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
      }

      // Sign out and redirect to login with success message
      await supabase.auth.signOut();
      toast({ title: "Password updated successfully", description: "Please sign in with your new password." });
      navigate("/auth", { replace: true });
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

  if (error || !sessionReady) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-md border-border/60">
          <CardHeader className="text-center space-y-3 pb-2">
            <img src={bookedJobsLogo} alt="BookedJobs" className="h-12 mx-auto rounded-lg" />
            <div>
              <CardTitle className="text-xl text-foreground">Link Expired</CardTitle>
              <CardDescription className="mt-1">
                This reset link has expired or was already used. This can happen if your email provider scanned the link before you clicked it.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <Button
              className="w-full"
              onClick={() => {
                setError(null);
                setChecking(true);
                setSessionReady(false);
                // Re-attempt token parsing
                const { access_token, refresh_token, token, token_hash, email } = parseTokensFromUrl();
                const type = new URLSearchParams(window.location.search).get("type") || new URLSearchParams(window.location.hash.substring(1)).get("type");
                const tryAgain = async () => {
                  if (token && email) {
                    const { error: otpError } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
                    if (!otpError) { setSessionReady(true); setChecking(false); return; }
                  }
                  if (token_hash && type === "recovery") {
                    const { error: hashErr } = await supabase.auth.verifyOtp({ token_hash, type: "recovery" });
                    if (!hashErr) { setSessionReady(true); setChecking(false); return; }
                  }
                  if (access_token && refresh_token) {
                    const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
                    if (!sessErr) { setSessionReady(true); setChecking(false); return; }
                  }
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session?.user) { setSessionReady(true); setChecking(false); return; }
                  setError("Still unable to verify. Please request a new password reset from the sign-in page.");
                  setChecking(false);
                };
                tryAgain();
              }}
            >
              Try Again
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
              Back to Sign In
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              If this keeps happening, go to Sign In and request a new reset link.
            </p>
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
                  autoComplete="new-password"
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
