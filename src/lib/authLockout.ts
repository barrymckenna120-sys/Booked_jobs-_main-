// Shared constants for the failed-login lockout flow.
// Keep in sync with supabase/functions/lock-failed-login/index.ts
// (ban_duration is set to LOCKOUT_DURATION_HOURS there — currently "1h").

export const LOCKOUT_MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_HOURS = 1;
export const LOCKOUT_DURATION_LABEL = "1 hour";

export const GENERIC_AUTH_ERROR =
  "Incorrect email or password. Please try again.";

export const BLOCKED_AUTH_ERROR =
  "Your account has been blocked. Please contact your administrator.";

/**
 * Inline error string shown under the sign-in form for a given failed-attempt count.
 * Attempts 1-2 stay generic to avoid leaking whether the email exists.
 * Attempts 3-4 warn how many tries remain.
 * Attempt 5 confirms the lockout.
 */
export function attemptsRemainingMessage(attempts: number): string {
  const remaining = LOCKOUT_MAX_ATTEMPTS - attempts;
  if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
    return `Account locked. Too many failed attempts — try again in ${LOCKOUT_DURATION_LABEL} or reset your password.`;
  }
  if (attempts === 4) {
    return `Incorrect password. 1 attempt remaining before your account is locked for ${LOCKOUT_DURATION_LABEL}.`;
  }
  if (attempts === 3) {
    return `Incorrect password. ${remaining} attempts remaining before your account is locked.`;
  }
  return GENERIC_AUTH_ERROR;
}

/**
 * Modal copy for the more prominent warnings on attempts 4 and 5.
 * Returns null when no modal should be shown.
 */
export function lockoutModalCopy(
  attempts: number,
): { title: string; message: string } | null {
  if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
    return {
      title: "Account Locked",
      message: `Too many incorrect password attempts. Your account has been locked for ${LOCKOUT_DURATION_LABEL}. You can reset your password to sign in sooner.`,
    };
  }
  if (attempts === 4) {
    return {
      title: "One attempt remaining",
      message: `If you enter the wrong password again your account will be locked for ${LOCKOUT_DURATION_LABEL}. You can reset your password instead.`,
    };
  }
  return null;
}
