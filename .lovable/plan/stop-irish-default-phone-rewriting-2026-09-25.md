# Stop Irish-default phone rewriting

## Confirmed current behaviour

- The first-booking intake rewrites a local-looking number to `+353…` before it is stored (`tally-incoming-job/phoneField.ts`).
- Renewal rebooking links rewrite the stored customer number through `rebookMobileParam` (`renewal-reminder-14` and `renewal-reminder-30`).
- Missed-call rebooking links separately rewrite the stored number through `toLocalIrishPhone` (`missed-call-lookup` → `_shared/rebookLink.ts`). For an international number, this can remove its real country code and produce a local-looking value; the returning rebook flow can then interpret that value as Irish.
- `tally-boiler-rebook` itself no longer adds `353`; it currently receives the already-altered link value and uses it for matching.

## Required behaviour

The phone value captured by the original booking must pass through storage and every rebooking URL unchanged. No leading-zero removal, no `353` prefix, no replacement normalization, and no new validation.

## Changes

1. Remove the Irish-default conversion from the first-booking phone preparation so the captured phone string is stored without country-code rewriting.
2. Replace both rebooking URL conversions with direct pass-through of the stored customer phone:
   - 14-day renewal links
   - 30-day renewal links
   - missed-call rebooking links
3. Remove only parameters/imports that become unused because of that deletion. Do not alter authentication, tenant binding, matching, deduplication, reminder selection, message wording, or any other field.
4. Update only the directly affected phone/rebooking tests so they assert byte-for-byte pass-through for Irish-local, `+353`, `+212`, `00…`, spaced and dashed captured values.

## Scope boundary

Outbound WhatsApp/API transport adapters that require digits-only recipient values, and comparison-only matching keys, will not be changed in this fix: they do not overwrite the captured customer number or the rebooking form value. Changing them would risk message delivery and duplicate matching, which is outside this reported defect.

## Verification before deployment

- Run the focused intake and rebooking-link regression tests.
- Confirm generated rebooking URLs decode `Mobile` to exactly the stored value for representative Irish and international numbers.
- Confirm the booking/rebooking tenant-auth and duplicate guards are unchanged.
- Run the relevant full test suite, TypeScript check and production build.
- Present the complete source diff and the exact functions requiring deployment.
- Stop for approval. Do not deploy any function or publish the app until the diff is approved.

## Risk

High enough for focused regression coverage because this affects booking intake and renewal links. The edit remains removal-only and does not change database security, publication status, payments, messaging triggers, or unrelated workflows.
