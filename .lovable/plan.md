# Close the wrong-company booking gap

## The problem, confirmed

The test booking at 16:25 (Irish time) today was created under **Dublin Gas**, not K&N Gas Services Ltd. The request arrived with:

- the company named in the message body as Dublin Gas,
- no company password,
- no form reference of any kind.

Because nothing identified the sender, the booking endpoint fell back to trusting the company named inside the message. This is the same mechanism behind the earlier K&N production misrouting.

Two things make it possible:

1. The fallback that accepts an unauthenticated booking's self-declared company.
2. No company has a booking form reference stored, so the middle safety check (match the sending form to a company) can never succeed for anyone.

Closing this immediately would reject real K&N bookings, because their automation may currently send no password. So it is closed in two stages.

## Stage 1 — See it before blocking it

Keep accepting bookings exactly as today, but make every unauthenticated arrival unmistakable and reviewable:

- Record, for each booking, how the company was determined: its own password, a form reference, or the untrusted fallback.
- For fallback arrivals, record which company was claimed and whether any password was presented at all, so the offending automation can be identified. No customer contact details recorded.
- Surface the count of fallback bookings so we can watch it drop to zero as automations are corrected.

Then submit one booking through each live K&N form and read back which route each took. That tells us exactly which automations still need their password added, without any risk to live bookings.

## Stage 2 — Shut the door

Once Stage 1 shows every live form authenticating with its own company password:

- A booking is accepted only when the sender presents that company's own password.
- Anything else is rejected with a clear recorded reason, rather than being saved to a guessed company.
- A booking may never be stored under a company other than the one its password belongs to.

Stage 2 ships as its own reviewed step, only after the evidence from Stage 1, and only with your go-ahead.

## Also worth doing alongside

Store each company's booking form reference so the second safety check works, giving a fallback route to correct identification that does not depend on the password alone. Read-only check first, then values filled in per company.

## Technical notes

- Change is confined to the booking intake function `supabase/functions/tally-incoming-job` and its shared organisation binding helper `supabase/functions/_shared/machineOrg.ts`.
- The strict behaviour already exists behind the `STRICT_MACHINE_ORG_BINDING` switch, which is currently unset. Stage 2 is largely enabling and verifying that path, not writing new tenant resolution logic.
- Stage 1 adds recording only. No change to tenant resolution, authentication, booking creation, or scheduling.
- Existing per-company passwords are all distinct and stay untouched. No company's password is copied anywhere.
- Tests: fallback arrival recorded correctly; password-authenticated arrival unaffected; mismatched password rejected; recorded data contains no customer contact details.

## Not in scope

- No changes to the external booking forms or automations from here.
- No changes to the double-booking behaviour — that is the next step after this, already confirmed and reproducible.
- The four existing Dublin Gas test jobs and today's two are left in place as evidence.
