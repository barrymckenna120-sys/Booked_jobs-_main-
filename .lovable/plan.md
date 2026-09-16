# Connect book.kngasservices.ie to the new K&N Gas Services Ltd tenant

## What the checks show (confirmed, read-only)

1. **The new tenant exists.** "K&N gas services Ltd" was created 14/09/2026. It has 6 jobs, 6 customers, 1 engineer, 1 staff login, its own web address (kngasservices.bookedjobs.ie) and its own settings row. The original "K&N Gas Services" tenant (created 31/03/2026) still holds the live history: 481 jobs, 85 customers, 10 engineers, 7 logins.

2. **book.kngasservices.ie itself is healthy and unchanged.** It answers normally, does not redirect, and opens Tally form `rj6j55`. rebook.kngasservices.ie opens form `RGJDy4`. Both addresses are recorded against the **new Ltd tenant** in our config — the original K&N tenant has no booking addresses recorded at all.

   But the address does not decide which company a booking lands under. That is decided by what the automation behind the form sends. Today's bookings landed under **Dublin Gas** (16:25) and under the **original K&N tenant** (09:39). The new Ltd tenant has received one form booking ever, on 14/09 during its setup.

3. **The new tenant has a booking password; it has no form reference.** Its password is its own and distinct from every other company's. No company in the system has a form reference stored, so the form-matching safety check can never succeed for anyone. Today's booking presented no password and no form reference at all, which is why the endpoint fell back to accepting the company named in the message body.

4. **Root cause: an unfinished cutover, not a form or password bug.** The new tenant was created and given the addresses, but the outside automation was never re-pointed at it — it still sends another company's identity and no password. Our side is missing only the form reference. Both sides need a change; the sending side is the one that actually moves the bookings.

## What to do

### Step 1 — Record the two form references against the Ltd tenant (our side)
Store `rj6j55` (new booking) and `RGJDy4` (rebooking) against K&N Gas Services Ltd, using the existing per-company integration settings. This gives a second, correct way to identify a booking's company that does not depend on the password being sent. Read the values back from the database afterwards to confirm.

No other company is touched. No change to how bookings are processed — the endpoint already prefers a form match over the untrusted fallback, so recording these values can only improve routing, never redirect an existing correct one.

### Step 2 — Update the sending automation (outside our system, needs Barry/Karl)
The Make.com scenario behind book.kngasservices.ie and rebook.kngasservices.ie must:
- send **K&N Gas Services Ltd's** company identifier, not the original K&N tenant's and not Dublin Gas's, and
- send that tenant's own booking password in the request.

I can supply the exact values to paste in, but I cannot make this change — it lives in the Make.com account. Until it is done, bookings from the live form will keep landing on the wrong company.

### Step 3 — Verify with one test booking
After Step 2, submit one booking through book.kngasservices.ie and read back how it was identified: it should show the company's own password (or the form reference), not the fallback. Repeat once through rebook.kngasservices.ie. Then confirm the jobs appear under K&N Gas Services Ltd.

### Step 4 — Then close the fallback door (Stage 2, already agreed in principle)
Once both live forms authenticate cleanly, switch the endpoint from warn-only to rejecting unauthenticated bookings. This ships as its own reviewed step, only after Step 3 passes — doing it earlier would reject Karl's real bookings.

## Decided: clean start
The Ltd tenant stays fresh — the original tenant's 481 jobs and 85 customers are **not** moved. No data migration in this plan or any follow-up. The only remaining setup question is giving Karl and his office staff logins on the new tenant, which is separate work.

## Technical notes
- Step 1 writes only the tally config keys for organisation `kn-gas-services-ltd` in `tenant_integrations`, merging into the existing row (booking URLs and webhook secret preserved). It is a data change, so it ships as its own isolated, idempotent, review-gated step with a real read-back.
- Company resolution order in `_shared/machineOrg.ts`: internal service call, then per-tenant webhook secret, then form reference, then the untrusted body-declared fallback. `STRICT_MACHINE_ORG_BINDING` remains unset until Step 4.
- Stage 1 diagnostics from the previous step are already live on both `tally-incoming-job` and `tally-boiler-rebook`, so Step 3 has the evidence trail it needs.
- Not in scope: the confirmed double-booking bug (one submission creating two jobs), the Dublin Gas test jobs left as evidence, and any change to payments or tenant isolation rules.
