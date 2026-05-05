# Fix silent login failures on the sign-in page

The login page (`src/pages/Auth.tsx`) is shared by office staff and engineers. Today, only errors whose message contains "invalid" trigger a visible modal — every other auth failure (user not found, email not confirmed, network error, etc.) falls through to a toast that engineers report as "silent". We'll add a clear inline error directly under the Sign In button, plus a spinner and clear-on-typing behaviour, without altering routing, lockout, or auth logic.

## Changes — `src/pages/Auth.tsx`

1. **Add a single inline error state** (`formError: string | null`) used for all sign-in failures.

2. **Catch block in `handleSubmit`**: keep the existing 3-strike lockout behaviour (failed-attempt counter + modal + `lock-failed-login` invocation on attempt 3 — preserved exactly), but ALSO set `formError` to the generic message:

   > "Incorrect email or password. Please try again."

   This message is used for every auth failure — invalid credentials, user not found, email not confirmed, network/unknown — so we never disclose which case it is. The existing toast fallback for non-"invalid" errors is removed in favour of the inline message (toast still used for the forgot-password flow).

3. **Inline error rendering**: directly below the Sign In button, render

   ```tsx
   {formError && (
     <p role="alert" className="text-sm text-destructive text-center mt-2">
       {formError}
     </p>
   )}
   ```

   Uses the existing `text-destructive` token for the red style.

4. **Loading spinner on submit button**: while `loading` is true, disable the button (already disabled) and show a `Loader2` icon from `lucide-react` spinning next to "Signing in…":

   ```tsx
   {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>) : "Sign In"}
   ```

5. **Clear error on typing**: in the email and password `onChange` handlers, call `setFormError(null)` alongside the existing `setEmail` / `setPassword`. Per project memory, `onChange` must pass the raw event value directly — we keep that pattern.

## What stays the same

- Route, redirect targets, and `navigate("/dashboard")` on success.
- 3-strike lockout sequence and `lock-failed-login` edge function call.
- Existing error modal (kept — it carries the lockout copy on attempts 2 and 3).
- Forgot-password flow, password recovery handling, and all `useEffect` auth listeners.
- No changes to `useAuth`, engineer linking, FCM token capture, or any other file.

## Out of scope

- No new route or separate engineer login page.
- No changes to Supabase, RLS, edge functions, or styling tokens beyond `text-destructive` and `Loader2`.
