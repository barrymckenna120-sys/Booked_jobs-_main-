import { useEffect, useState, useRef } from "react";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

const Auth = () => {
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const GENERIC_AUTH_ERROR = "Incorrect email or password. Please try again.";
  const BLOCKED_AUTH_ERROR = "Your account has been blocked. Please contact your administrator.";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const isRecovery = params.get("type") === "recovery" || hash.includes("type=recovery");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
        return;
      }
      if (isRecovery) return;
      if (session?.user) {
        navigate("/dashboard", { replace: true });
      }
    });

    if (hash.includes("type=recovery") && hash.includes("access_token")) {
      navigate("/reset-password" + hash, { replace: true });
      return () => subscription.unsubscribe();
    }

    if (!isRecovery) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          navigate("/dashboard", { replace: true });
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    setLoading(true);
    setFormError(null);

    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setFailedAttempts(0);

      let redirectPath = "/dashboard";
      const userId = signInData?.user?.id;
      if (userId) {
        // Always read the role fresh from the engineers table — never trust
        // cached JWT claims, since role updates in the DB don't refresh the JWT.
        const { data: engineerRow } = await supabase
          .from("engineers")
          .select("role, can_access_office")
          .eq("auth_user_id", userId)
          .maybeSingle();
        const role = (engineerRow as any)?.role;
        const canOffice = !!(engineerRow as any)?.can_access_office;
        const elevated = ["owner", "manager", "admin", "office"].includes(role);
        // Only true engineers without office access go to the engineer app.
        if (role === "engineer" && !canOffice && !elevated) {
          redirectPath = "/engineer/today";
        }
      }
      navigate(redirectPath);
    } catch (error: any) {
      // Check for network failure first
      const isNetworkError =
        error instanceof TypeError ||
        (error?.message || "").toLowerCase().includes("failed to fetch") ||
        (error?.message || "").toLowerCase().includes("network") ||
        (error?.message || "").toLowerCase().includes("not connected") ||
        navigator.onLine === false;

      if (isNetworkError) {
        setFormError("No internet connection. Please check your signal and try again.");
        return;
      }

      const msg = (error?.message || "").toLowerCase();
      const code = (error?.code || "").toLowerCase();
      const isBanned = code === "user_banned" || msg.includes("banned");

      if (isBanned) {
        setFormError(BLOCKED_AUTH_ERROR);
        setIsBlocked(true);
      } else {
        setFormError(GENERIC_AUTH_ERROR);
      }

      if (msg.includes("invalid")) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);

        if (newAttempts >= 5) {
          setErrorTitle("Account Blocked");
          setErrorMessage("Your account has been blocked due to too many incorrect password attempts. Please contact your office administrator.");
          setIsBlocked(true);
          setFormError(BLOCKED_AUTH_ERROR);
          setErrorModalOpen(true);
          supabase.functions.invoke("lock-failed-login", {
            body: { email: email.trim() },
          }).catch(() => {});
        } else if (newAttempts === 4) {
          setErrorTitle("Incorrect Password");
          setErrorMessage("Incorrect password. If you enter the wrong password again your account will be blocked. Please contact your office administrator.");
          setErrorModalOpen(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-reset-email", {
        body: { email: email.trim() },
      });
      if (error) throw error;
      setResetSent(true);
      logAudit({
        action_type: "password_reset_requested",
        entity_type: "user",
        entity_id: email.trim(),
        detail: `Password reset requested by ${email.trim()}`,
        metadata: { target_email: email.trim(), triggered_by: "self" },
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const closeErrorModal = () => {
    setErrorModalOpen(false);
    if (!isBlocked) {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={bookedJobsLogo} alt="BookedJobs" className="h-10 mx-auto mb-2" />
            <CardTitle className="text-lg">Reset Your Password</CardTitle>
            <CardDescription>
              {resetSent
                ? "Check your email — we've sent you a reset link"
                : "Enter your email and we'll send you a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="text-center space-y-4">
                <div className="text-4xl">📧</div>
                <p className="text-sm text-muted-foreground">
                  If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
                </p>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setResetSent(false);
                    setEmail("");
                  }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setResetSent(false); }}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={bookedJobsLogo} alt="BookedJobs" className="h-10 mx-auto mb-2" />
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pr-10"
                  disabled={isBlocked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="text-xs text-primary hover:underline"
              >
                Forgot your password?
              </button>
            </div>
            <Button type="submit" className="w-full" disabled={loading || isBlocked}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                </span>
              ) : "Sign In"}
            </Button>
            {formError && (
              <p role="alert" className="text-sm text-destructive text-center mt-2">
                {formError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Dialog open={errorModalOpen} onOpenChange={(v) => { if (!v) closeErrorModal(); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{errorTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <Button className="w-full mt-2" onClick={closeErrorModal}>
            {isBlocked ? "Close" : "Try Again"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
