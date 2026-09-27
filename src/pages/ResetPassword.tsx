import { useEffect, useRef, useState } from "react";
import type { VerifyOtpParams } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/auditLog";
import { logAuthActivity } from "@/lib/authActivity";
import AppLogo from "@/components/shared/AppLogo";

const parseTokensFromUrl = () => {
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  const access_token = hashParams.get("access_token") || queryParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token") || queryParams.get("refresh_token");
  const type = hashParams.get("type") || queryParams.get("type");
  const token = queryParams.get("token");
  const token_hash = queryParams.get("token_hash") || hashParams.get("token_hash");
  const email = queryParams.get("email");

  return { access_token, refresh_token, type, token, token_hash, email };
};

const hasRecoveryIntent = () => {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return (
    hash.includes("type=recovery") ||
    hash.includes("type=invite") ||
    params.get("type") === "recovery" ||
    params.get("type") === "invite"
  );
};

/** Resolves the one-time-token type: missing → recovery; anything other than invite/recovery → null (rejected). */
export const resolveOtpType = (type: string | null): "invite" | "recovery" | null => {
  if (!type) return "recovery";
  if (type === "invite" || type === "recovery") return type;
  return null;
};

export interface ResetAuthClient {
  getSession: () => Promise<{ data: { session: { user: unknown } | null } }>;
  verifyOtp: (params: VerifyOtpParams) => Promise<{ error: { message: string } | null }>;
  setSession: (params: { access_token: string; refresh_token: string }) => Promise<{ error: { message: string } | null }>;
}

/**
 * Establishes a session for the reset/invite flow.
 * If the URL carries a one-time token, it is ALWAYS verified first and replaces any
 * existing session — a pre-existing session (e.g. someone else already signed in on
 * this browser) must never be reused for an invitee's or resetter's account.
 */
export const establishResetSession = async (
  auth: ResetAuthClient,
  params: { access_token: string | null; refresh_token: string | null; type: string | null; token: string | null; token_hash: string | null; email: string | null },
  onVerified: () => void = () => {}
): Promise<boolean> => {
  const { access_token, refresh_token, type, token, token_hash, email } = params;

  if (token || token_hash) {
    const otpType = resolveOtpType(type);
    if (!otpType) return false;
    if (token && email) {
      const { error } = await auth.verifyOtp({ email, token, type: otpType });
      if (!error) { onVerified(); return true; }
    } else if (token_hash) {
      const { error } = await auth.verifyOtp({ token_hash, type: otpType });
      if (!error) { onVerified(); return true; }
    }
    return false;
  }

  const { data: { session } } = await auth.getSession();
  if (session?.user) return true;

  if (access_token && refresh_token) {
    const { error } = await auth.setSession({ access_token, refresh_token });
    if (!error) return true;
  }
  return false;
};

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isInvite] = useState(() => parseTokensFromUrl().type === "invite");

  const stripTokenFromUrlNow = () => {
    try {
      window.history.replaceState({}, "", "/reset-password");
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // iOS Chrome fix: if recovery intent is detected, show form immediately
    // without waiting for session establishment
    if (hasRecoveryIntent()) {
      setShowForm(true);
    }

    const stripTokenFromUrl = () => {
      try {
        window.history.replaceState({}, "", "/reset-password");
      } catch {
        /* noop */
      }
    };

    const establish = async () => {
      const { access_token, refresh_token, type, token, token_hash, email } = parseTokensFromUrl();

      // Methods 1 & 2: one-time token links (token + email, or token_hash).
      // Never verify on page load — email link scanners would consume the token.
      // Verification happens only on submit in establishSessionIfNeeded().
      if (token || token_hash) {
        setShowForm(true);
        return;
      }

      // Method 3: Explicit access_token + refresh_token
      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!sessionError) { stripTokenFromUrl(); setSessionReady(true); setShowForm(true); return; }
        if (!hasRecoveryIntent()) { setError("This link has expired or is invalid. Please request a new password reset."); }
        return;
      }

      // Method 4: Already have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) { setSessionReady(true); setShowForm(true); return; }

      // Fallback: listen for PASSWORD_RECOVERY event
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          stripTokenFromUrl();
          setSessionReady(true);
          setShowForm(true);
        }
      });
      subscription = data.subscription;

      // Timeout — only show error if form isn't already visible
      timeoutId = setTimeout(() => {
        setShowForm((prev) => {
          if (!prev) setError("This link has expired. Please request a new password reset.");
          return prev;
        });
      }, 5000);
    };

    establish();

    return () => {
      if (subscription) subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const establishSessionIfNeeded = async (): Promise<boolean> => {
    // Check if we already have a session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return true;

    // Try to establish from URL tokens
    const { access_token, refresh_token, type, token, token_hash, email } = parseTokensFromUrl();

    if (token || token_hash) {
      const otpType = resolveOtpType(type);
      if (!otpType) return false;
      if (token && email) {
        const { error } = await supabase.auth.verifyOtp({ email, token, type: otpType });
        if (!error) { stripTokenFromUrlNow(); return true; }
      }
      if (token_hash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: otpType });
        if (!error) { stripTokenFromUrlNow(); return true; }
      }
    }
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (!error) return true;
    }
    return false;
  };

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
      // If session wasn't ready yet (iOS Chrome), try to establish it now
      if (!sessionReady) {
        const established = await establishSessionIfNeeded();
        if (!established) {
          toast({
            title: "Session expired",
            description: "Please request a new password reset link.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        setSessionReady(true);
      }

      // Double-check session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: "Session expired",
          description: "Please request a new password reset link.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If the link carried a one-time token, the session must belong to the
      // invited/reset account — never to whoever was already signed in.
      const urlParams = urlTokensRef.current;
      if ((urlParams.token || urlParams.token_hash) && urlParams.email && session.user.email?.toLowerCase() !== urlParams.email.toLowerCase()) {
        toast({
          title: "This link is for a different account.",
          description: "Please sign out and open the link again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        logAudit({
          action_type: "password_reset_completed",
          entity_type: "user",
          entity_id: user.id,
          detail: `Password reset completed by ${user.email}`,
          metadata: { target_email: user.email, triggered_by: isInvite ? "invite" : "self" },
        });
        logAuthActivity({
          event_type: "password_changed",
          user_id: user.id,
          email: user.email ?? null,
        });
      }


      await supabase.auth.signOut();
      toast({ title: "Password updated!", description: "Please log in." });
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Show error only if form isn't visible
  if (error && !showForm) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-md border-border/60">
          <CardHeader className="text-center space-y-3 pb-2">
            <AppLogo variant="mark" size="large" className="mx-auto" />
            <div>
              <CardTitle className="text-xl text-foreground">Link Expired</CardTitle>
              <CardDescription className="mt-1">
                This reset link has expired or was already used. This can happen if your email provider scanned the link before you clicked it.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <Button variant="outline" className="w-full" onClick={() => navigate("/auth")}>
              Back to Sign In
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Go to Sign In and request a new reset link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verifying link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-md border-border/60">
        <CardHeader className="text-center space-y-3 pb-2">
          <AppLogo variant="mark" size="large" className="mx-auto" />
          <div>
            <CardTitle className="text-xl text-foreground">{isInvite ? "Set up your account" : "Set New Password"}</CardTitle>
            <CardDescription className="mt-1">{isInvite ? "Choose a password to finish setting up your account." : "Choose a secure password for your account"}</CardDescription>
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
              {loading ? "Updating…" : isInvite ? "Create password" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
