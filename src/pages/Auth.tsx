import { useEffect, useState, useRef } from "react";
import bookedJobsLogo from "@/assets/bookedjobs-logo.jpg";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveLandingPath } from "@/lib/resolveLandingPath";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";
import {
  LOCKOUT_MAX_ATTEMPTS,
  GENERIC_AUTH_ERROR as LOCKOUT_GENERIC_ERROR,
  BLOCKED_AUTH_ERROR as LOCKOUT_BLOCKED_ERROR,
  attemptsRemainingMessage,
  lockoutModalCopy,
} from "@/lib/authLockout";

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

  const GENERIC_AUTH_ERROR = LOCKOUT_GENERIC_ERROR;
  const BLOCKED_AUTH_ERROR = LOCKOUT_BLOCKED_ERROR;

  const [showUnblockedNotice, setShowUnblockedNotice] = useState(false);

  useEffect(() => {
    // Clear any legacy cached "blocked" state so an unblocked user is never
    // stuck behind a stale UI lock after their admin unblocks them.
    try {
      ["auth_blocked", "blocked_email", "is_blocked"].forEach((k) => localStorage.removeItem(k));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("auth_blocked_")) localStorage.removeItem(key);
      }
    } catch { /* ignore storage errors */ }

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

  const prevBlockedKey = (addr: string) => `bj_prev_blocked:${addr.trim().toLowerCase()}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Never hard-disable submit from cached state — the server is source of truth.
    setLoading(true);
    setFormError(null);
    setShowUnblockedNotice(false);

    try {
      const authPromise = supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), 15000)
      );
      const { data: signInData, error } = await Promise.race([authPromise, timeoutPromise]) as any;
      if (error) throw error;
      setFailedAttempts(0);
      setIsBlocked(false);
      try { localStorage.removeItem(prevBlockedKey(email)); } catch { /* ignore */ }

      let redirectPath = "/dashboard";
      const userId = signInData?.user?.id;
      if (userId) {
        redirectPath = await resolveLandingPath(userId);
      }
      navigate(redirectPath);

    } catch (error: any) {
      const isNetworkError =
        error?.message === "REQUEST_TIMEOUT" ||
        (error?.message || "").toLowerCase().includes("failed to fetch") ||
        (error?.message || "").toLowerCase().includes("network") ||
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
        // Remember that this address was blocked so we can show a green
        // "you can now sign in" notice once the admin unblocks them.
        try { localStorage.setItem(prevBlockedKey(email), "1"); } catch { /* ignore */ }
      } else {
        setFormError(GENERIC_AUTH_ERROR);
      }

      if (msg.includes("invalid")) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);

        // Inline attempts-remaining messaging (attempts 1-2 stay generic).
        setFormError(attemptsRemainingMessage(newAttempts));

        const modal = lockoutModalCopy(newAttempts);
        if (modal) {
          setErrorTitle(modal.title);
          setErrorMessage(modal.message);
          setErrorModalOpen(true);
        }

        if (newAttempts >= LOCKOUT_MAX_ATTEMPTS) {
          try { localStorage.setItem(prevBlockedKey(email), "1"); } catch { /* ignore */ }
          supabase.functions.invoke("lock-failed-login", {
            body: { email: email.trim() },
          }).catch(() => {});
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
                onChange={(e) => {
                  const v = e.target.value;
                  setEmail(v);
                  setFormError(null);
                  try {
                    const wasBlocked = !!localStorage.getItem(prevBlockedKey(v));
                    setShowUnblockedNotice(wasBlocked && v.trim().length > 0);
                  } catch { /* ignore */ }
                }}
                placeholder="you@example.com"
                required
              />
              {showUnblockedNotice && !formError && (
                <p className="text-sm text-green-600">
                  Your account has been unblocked. You can now sign in.
                </p>
              )}
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
            <Button type="submit" className="w-full" disabled={loading}>
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
          <div className="flex flex-col gap-2 mt-2">
            <Button className="w-full" onClick={closeErrorModal}>
              {failedAttempts >= LOCKOUT_MAX_ATTEMPTS ? "Close" : "Try Again"}
            </Button>
            {failedAttempts >= 4 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setErrorModalOpen(false);
                  setIsForgotPassword(true);
                }}
              >
                Reset password
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
