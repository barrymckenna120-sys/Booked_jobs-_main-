# Behavioural verification of the token-refresh fix

Answers to your five points, then the plan for what I'd actually do.

## 1. Whose session is active — and the problem with the Cavan invite

Checked against the live database:

- `624f0c61-6646-497f-bb44-2f8176129280` is **abdenneur1@gmail.com**, whose profile role is **superadmin**, org **K&N Gas Services**. So yes — that log line was your superadmin account, not a Cavan engineer.
- On the Cavan Gas tenant there is exactly **one** team member row, created today at 11:57: name "Noor", role "owner", email **abdenneur1@gmail.com** — the same email as your superadmin account. It has no login linked to it yet.
- There is **no new login account** in the system for Cavan Gas. The newest accounts created are from 11 and 12 August; nothing was created today.

Plain-language consequence: the invite was sent to your own existing email address, so there is no separate Cavan engineer login to sign into. Signing in with that email just puts you back in the superadmin account. Worse, the app has an auto-link step that attaches a team member row to a login when the email matches uniquely — so the next sign-in with that email risks quietly attaching your superadmin login to the Cavan "owner" row while your profile still says K&N, which is exactly the mixed-org state that produces wrong-data-with-no-error.

So step one is not "log out and log back in" — it is to create a genuinely separate Cavan test login on a different email address (e.g. an alias like `yourname+cavan@gmail.com`), and to remove or correct the "Noor" row that currently carries your superadmin email.

For reference, once a proper separate login exists: "Exit" on the amber View As bar only stops impersonation, it does not sign you out. A real switch of account means Exit View As, then sign out from the account menu, then sign in with the other email on the normal login page — ideally in a different browser profile or private window so the two sessions don't overwrite each other.

## 2. The 401 on `/rest/v1/`

Not yet explained, and I will not guess. A 401 during a brief loading moment is often harmless, but it can also mean a stale refresh token — the same failure that broke the earlier impersonated attempt. It needs the actual request identified (which table/endpoint, and whether it was retried successfully) before calling it benign. That identification is a step in the plan below, done from the live app rather than assumed.

## 3. Reaching the auth client from the console

Confirmed by reading the code: the Supabase client is a module import (`src/integrations/supabase/client.ts`), deliberately not attached to `window`, and there is no existing debug global anywhere in `src/`. So there is no console command that can reach it today, and no React DevTools trick that reliably returns it.

Rather than have you paste console commands, the plan adds a **dev-only** helper that exists only in preview/dev builds and is compiled out of production, exposing a single action: force a token refresh. It gets removed once the test passes, same as the force-error trigger was.

## 4. + 5. I should run this test, not you

Yes — I can drive the real app in a browser here with a genuine, non-impersonated session for a chosen account, watch the console and network traffic, and take screenshots. That is faster and more reliable than manual console work, because I can measure the things eyeballing can't confirm: whether the role check re-runs, whether the notification subscription is torn down and rebuilt, and how many extra database reads fire after the refresh. The earlier attempt failed only because it was inside an impersonated session; a real one avoids that.

## Plan

### Step 1 — Fix the Cavan test account (needs your decision)
Create a separate Cavan Gas login on its own email address, and correct the "Noor" row that currently holds your superadmin email so the auto-link can never attach your superadmin account to Cavan. I'll propose the exact change for approval before touching data.

### Step 2 — Dev-only refresh helper
Add a small helper, active only in dev/preview, that triggers a real token refresh on demand. No production exposure, no effect on any session other than the one in the browser running it.

### Step 3 — Run the test with the real Cavan session
On the office shell: record a baseline (role check state, notification bell count, active realtime subscription, network requests), trigger the refresh, then measure for 10 seconds.

- **PASS**: the refresh happens, the sidebar and bell do not flicker or reset, the role check does not re-run, the notification subscription is not rebuilt, and no new database reads or errors appear.
- **FAIL**: any of a visible reload, badge resetting to zero, a brief permission/role flash, a rebuilt subscription, or fresh errors.

Then click through Dashboard → Jobs → Customers → Finance to confirm normal behaviour continues after the refresh.

### Step 4 — Identify the 401
Capture the failing request during the same session and report what it was and whether it self-corrected.

### Step 5 — Remove the helper and report
Delete the dev-only helper, then report pass/fail per file (`useUserRole`, `useUnreadMessages`, `MessageAlertBanner`, `Finance`) with the evidence for each.

No payment, messaging-send, or customer-data actions at any point. If Step 3 fails, I'll report the cause before proposing any fix.
