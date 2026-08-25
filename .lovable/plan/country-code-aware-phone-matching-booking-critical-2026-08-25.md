# Country-code-aware phone matching (booking-critical)

## The bug

Inbound number → customer matching compares only the **last 9 digits** and throws away the
country code. Two numbers from different countries that happen to share their final 9 digits
are treated as the same person.

Live example in the K&N data today:

| Name | Phone | Kind |
|---|---|---|
| abdenneur4 / abdenneur5 | `+212656802656` | test records (Morocco) |
| **Sean Murphy** | **`+353656802656`** | customer record (Ireland), 8 logged messages |

`samePhone("+212656802656", "+353656802656")` returns **true**.

### Why this is booking-critical, not cosmetic

An inbound WhatsApp `CANCEL` from the Moroccan handset feeds all three records' jobs into
`pickActingOrg`. Sean Murphy has no jobs right now, so nothing breaks today. But if he ever
books and receives a 2-day reminder while the test records have none, there is **exactly one**
eligible job — so the "never guess" guard does not trigger, and the reply **cancels a real
customer's booking and sends them a cancellation WhatsApp**.

The same collision also lets `missed-call-lookup` and `matchCustomer` attach an inbound
contact, a job, or a message to the wrong person's file across countries.

## The fix

Make the matching key **country-code aware** while keeping it tolerant of the messy formats
inbound webhooks actually send (`0872…`, `00353…`, `+353 87 123 4567`).

In `supabase/functions/_shared/phone.ts`:

- Add a canonical key built on `toE164Digits` (which already resolves `+`, `00`, and leading
  `0` correctly and is not Irish-only) instead of a blind `slice(-9)`.
- `samePhone(a, b)` compares those canonical keys, so the country codes must agree.
- Keep `last9Digits` exported but narrow it to what it honestly is: a **candidate-narrowing
  hint** for cheap DB pre-filtering, never a final equality test. Document that and mark it
  accordingly.
- Ambiguous input that cannot be resolved to a country (a bare 9-digit local fragment with no
  prefix) resolves to Irish `+353`, matching the current stored-data assumption. That keeps
  existing legacy Irish rows matching exactly as they do now.

## Call sites to update

All five consumers of the matcher, so the loose comparison cannot survive anywhere:

1. `supabase/functions/whatsapp-inbound/index.ts` — passes `samePhone` into
   `resolveInboundSender`; the `last9Digits` DB pre-filter stays as a coarse narrowing query,
   with `samePhone` as the authoritative filter. **This is the cancel/confirm path.**
2. `supabase/functions/_shared/matchCustomer.ts` — step 2's
   `last9Digits(r.phone) === key` filter becomes a `samePhone` comparison.
3. `supabase/functions/missed-call-lookup/index.ts` — same change to its `.find(...)`.
4. `src/components/jobs/NewJobPanel.tsx` — the duplicate-phone warning on job creation.
5. `src/lib/customerValidation.ts` — the deliberate frontend twin of `last9Digits`; updated in
   step with the shared version so the two cannot drift.

`cancelIntent.ts` itself needs no change — it receives the matcher by injection, which is why
the fix lands cleanly in one place.

## Regression tests

New cases in `supabase/functions/_shared/phone.test.ts` and `cancelIntent.test.ts`:

- **The collision:** `+212656802656` vs `+353656802656` must NOT match — asserted directly and
  through `resolveInboundSender`, which must return `no_match` for the Moroccan sender against
  an Irish-only candidate set.
- **No regression on Irish formats:** `+353871234567`, `353871234567`, `0871234567`,
  `00353871234567`, and `+353 87 123 4567` must all still match each other.
- A cross-country sender must not be able to reach an eligible job belonging to the
  same-last-9 Irish record — the end-to-end version of the cancel scenario above.
- Existing coverage is corrected: `resolveInboundSender matches regardless of stored format`
  currently asserts the loose behaviour and will be tightened to "regardless of formatting,
  but not across country codes".
- `last9Digits` keeps its own tests as a narrowing hint, with an explicit case documenting
  that it deliberately collides across countries and must not be used for equality.

## Test number for the live CANCEL/CONFIRM run

One correction to the instruction, because the safe option is the opposite of what it sounds
like: **I should not invent a `+353` number.** Ireland has no reserved "drama" range, so any
plausible `+353` mobile I make up is likely a real person's line — and the test's whole point
is that it fires a real outbound WhatsApp cancellation. Registering an invented number would
create the exact "messaged a stranger" outcome the rule exists to prevent, and would plant a
fake customer row that a future import could collide with.

Recommended instead, in this order:

1. Land this matcher fix.
2. Then run the live test from **`+212656802656`** — a handset you already control. Once
   country codes must agree, it no longer collides with Sean Murphy or any `+353` record, so
   the "zero future collision" requirement is satisfied by the fix rather than by number
   choice.

If you would rather not use the Moroccan handset at all, give me any real `+353` mobile you
control and I will check it for collisions before registering it.

## Scratch data (separate, review-gated step)

Creating the scratch customer and the two scratch jobs is a database write, so it stays its
own isolated step after the code fix is approved and green — not bundled with this change.

## Out of scope

No change to reminder scheduling, job status transitions, notification routing, or the
`resolveReplyTarget` / `pickActingOrg` decision rules. Only the phone comparison changes.
