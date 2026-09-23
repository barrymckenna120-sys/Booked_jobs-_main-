# Safari-only sign-in failure: diagnose before changing behaviour

## What the new evidence actually tells us

The screen Karl sees says "No internet connection. Please check your signal
and try again." That exact wording exists in one place only: the sign-in form,
shown when the sign-in request to the backend fails with a network-style error
(`src/pages/Auth.tsx:367-374`, wording chosen by `isAuthNetworkError` in
`src/lib/authLockout.ts`).

That is an important narrowing: the app itself is starting, loading its code
and rendering the login screen. The failure is a single request to the backend
being refused or never completing — in Safari, on the same phone and network
where Chrome succeeds. So this is a different fault from last week's stale
installed-copy problem, and the boot watchdog is not involved.

Two things we can already rule out from the code as read today:

- The login session is kept in ordinary first-party storage on the published
  domains, not in cross-site cookies, so Safari's tracking protection and
  storage partitioning have nothing to partition here. They can shorten how
  long a stored login survives; they cannot turn a request into a network
  failure.
- Nothing in our code shortens Safari's request timeout. Our own ceiling is the
  same 15 seconds in every browser.

What we do **not** yet know is why the request fails, and I am not going to
name a cause without evidence. Realistic candidates, in the order I would test
them, are: Apple's private relay / "hide IP address" (Safari-only, on for
anyone with iCloud+, and active in private browsing and home-screen apps —
Chrome never uses it); a carrier or content-blocker rule applied to Safari
traffic; the two third-party scripts we load at startup (error reporting with
session replay, and a marketing visitor script) behaving differently under
Safari's restrictions; or WebKit's known habit of failing a reused connection
outright on weak signal instead of retrying.

## One real defect found while reading

Every network-flavoured sign-in failure returns early and is **never
reported** — it is the one failure path with no diagnostics attached. That is
exactly the case Karl keeps hitting, which is why we have no detail on it.

## Plan

### Step 1 — Make the failure report itself (no behaviour change)

Report network sign-in failures with the detail needed to tell these causes
apart: error name and message as the browser worded it, how long the request
ran before failing, whether the browser claimed to be online, whether this is
Safari, private browsing, and home-screen vs browser tab. The message the user
sees stays byte-for-byte identical.

### Step 2 — A self-contained connection check page

A small public page Karl can open on the same phone in Chrome, then Safari
private, then the installed icon, that runs a fixed set of probes in order and
prints each result with its timing on screen:

1. a plain reachability call to the backend that needs no login
2. the same call repeated, to expose a reused-connection failure
3. a call to the backend's auth endpoint (no credentials submitted)
4. a call to our own domain, as a control
5. whether the third-party startup scripts loaded

The page screenshots itself, in effect: Karl sends one picture per browser and
the difference between the three columns names the cause. No credentials are
entered and nothing is written.

### Step 3 — Fix what the evidence names, one change at a time

Held deliberately open. Depending on the result this is either a startup-script
change, a request-level retry for the first failed attempt, or advice about a
device/carrier setting that no code change can fix. Each fix ships on its own
with a real-device retest.

## Technical notes

- Step 1: extend the existing early-return branch in `src/pages/Auth.tsx` to
  `Sentry.captureMessage` with tags (`engine`, `display_mode` already set in
  `src/instrument.ts`, `elapsed_ms`, `navigator.onLine`, `error_name`). No copy
  or control-flow change.
- Step 2: new public route + page only, added to `PUBLIC_PATH_PREFIXES` in
  `src/hooks/useAuth.tsx` so it never redirects to sign-in. Probes use bare
  `fetch` with per-probe `AbortController`, publishable key only, no session
  reads, no writes.
- Suspects to confirm/exclude in step 2 output: Apple private relay, the
  `reb2b` CloudFront script and Sentry replay/tracing in `index.html` /
  `src/instrument.ts`, trace headers added to backend calls forcing a preflight,
  and WebKit connection reuse.
- Out of scope: auth logic, lockout rules, tenant scoping, RLS, service worker
  and caching rules, the boot watchdog.

## Also in your message

Your note about the cloned K&N Ltd Make scenarios was cut off mid-sentence
("rebooking done, 2..."). Send the rest and I will treat it as a separate item
rather than folding it into this one.
