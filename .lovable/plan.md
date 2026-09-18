# P1 — Mobile-data loading failure: read-only diagnostic

Nothing was changed. This is the traced startup chain, the confirmed code-level findings, and the two device tests to run before any fix.

## Startup chain, as the code actually runs it

```text
domain (kngasservices.bookedjobs.ie / karlsgas.lovable.app)
  -> index.html            (served by saved copy after the recent offline fix)
  -> BLOCKING: fonts.googleapis.com stylesheet   <-- not saved on the phone
  -> async: ddwl4m2hdecbv.cloudfront.net tracking script (non-blocking)
  -> /assets/index-*.js + .css   (saved on the phone)
  -> React boot -> service worker -> Supabase client created
  -> session restore (bounded, 15s) -> sign-in screen or app
  -> per-screen data requests (bounded, 15s, one retry)
```

Outside addresses required during start-up and sign-in: the app's own domain, `fonts.googleapis.com` + `fonts.gstatic.com`, `ddwl4m2hdecbv.cloudfront.net`, `ktkfuquqxbrmuqrmbmdj.supabase.co` (database, auth, functions), `www.gstatic.com` (push notifications), and later `res.cloudinary.com` for photos.

## Confirmed findings (read from the code, not inferred)

1. **Fonts block the first paint and are never saved for offline use.** `index.html` loads the Google Fonts stylesheet as a normal blocking stylesheet. The saved-copy list in `vite.config.ts` covers the page, the app files, icons and the manifest — it does not cover fonts, and there is no rule to serve fonts from the phone. On a connection that shows full bars but passes no traffic, the browser waits on that stylesheet before showing anything. This is the earliest single request in the chain that can hold the screen blank, and it sits *outside* everything we fixed last time.
2. **A network failure on an iPhone is reported as "Incorrect email or password".** The sign-in screen treats a failure as a connection problem only when the message contains "failed to fetch" or "network", or when the phone reports itself offline. iOS Safari words a failed request as **"Load failed"**, and a 5G-with-no-internet phone reports itself *online*. Both conditions miss, so the code falls through to the generic wrong-credentials message. That fully explains the misleading login error Barry saw, and it also means each such failure can count toward the five-attempt account lock.
3. Session restore, the lockout pre-check and screen data requests are all time-bounded already, so they are unlikely to be the cause of an indefinite spinner.
4. The tracking script is loaded asynchronously and cannot block the screen.

## Priority table

| # | Failure point | Evidence | File / function | Wi-Fi | 4G/5G-no-internet | Reproduce | Recommended fix | Risk |
|---|---|---|---|---|---|---|---|---|
| P1 | Blocking Google Fonts stylesheet, not saved offline | `index.html` head; saved-copy list in `vite.config.ts` has no font entries | `index.html`, `vite.config.ts` | loads instantly | blank screen until the browser gives up on fonts | throttle/deny only `fonts.googleapis.com`, reload | make fonts non-blocking and/or serve them from the phone | low |
| P2 | Network failure shown as wrong password | `src/pages/Auth.tsx` `handleSubmit` catch block; only matches "failed to fetch"/"network"/offline | `src/pages/Auth.tsx` | correct message | "Incorrect email or password", can lock the account | sign in with the backend blocked on an iPhone | also treat "load failed" / timeouts as connection problems | low |
| P3 | Fonts stylesheet also delays the installed app after the saved page is served | same as P1, but on the home-screen icon path | `index.html` | fine | saved page appears then stalls on fonts | relaunch installed app with no usable data | as P1 | low |
| P4 | Carrier DNS / IPv6 differences on the backend hostname | not verifiable from the codebase | n/a | fine | would fail sign-in and data, not the app frame | the two tests below | only if the tests point there | n/a |

## Three most likely root causes, by evidence

1. The blocking, never-cached Google Fonts stylesheet holding the first paint on mobile data (strongest — visible in the code, and outside the previous fix).
2. iOS wording of network failures being misread as wrong credentials on the sign-in screen (confirmed in the code; explains the reported login message).
3. A network-path problem on the carrier (DNS/IPv6) affecting the backend hostname — plausible but not provable from the codebase; the two tests below decide it.

## The two tests, and what each result means

On the affected Samsung and iPhone, Wi-Fi off, mobile data on:

- Test A — open the normal BookedJobs web address in Safari/Chrome (not the installed icon).
- Test B — launch the installed BookedJobs icon.

Both fail the same way -> network/DNS/backend path, or the fonts request (cause 1 or 3).
Browser fine, installed app fails -> the installed app's saved copy and update lifecycle.
Frame appears but sign-in says wrong password -> cause 2, confirmed.

Please run those two and tell me exactly what each does (blank, spinner, error text, how long).

## If you want the fix now instead

Two small, separate changes, in this order, each verified on its own:

1. Make the fonts stylesheet non-blocking and serve fonts from the phone when the network is unusable — `index.html` plus a font rule in the saved-copy config.
2. Treat iOS "load failed" and timeouts as connection problems on the sign-in screen, so a signal problem never reads as a wrong password or counts toward the account lock.

No changes to authentication rules, permissions, tenant separation, the database, or anything below the start-up path. Feature work stays paused until these are verified.
