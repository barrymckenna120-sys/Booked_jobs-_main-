# Findings: 1 form fill → 2 WhatsApps (KN Gas Services Ltd, 24/09/26 13:51)

## Answers
1. **One job, not two.** Only KN-010 (`f5b0e442…`) was created. The double-booking guard fired: one claim row (fingerprint `beeea490…`), and the second arrival logged "duplicate booking content" and returned the existing job.
2. **WhatsApp fired twice because the automation (Make) sent it once per arrival.** Our booking intake does not send this message. Two `new_job_confirmation` log rows at 13:51:25.7 and 13:51:30.6 match two separate message-logging calls. On the duplicate arrival we reply "success, duplicate: true" with the same job ID. Make treats that as success and sends the confirmation again.
3. **The submission IDs are different:** `689e1ba0-ebd0-…` and `1276d77c-fc59-…`. Both arrived within about 0.1s with identical answers. That means the form side (Tally, or Make) delivered it twice with a new ID each time. It was not two separate customer fill-ins. This is also why the ID-based check didn't catch it, and only the content fingerprint did.

## Comparison with last week
- The job side is fixed: no second job was created.
- This is a **different variant**: the second arrival still sets off the downstream WhatsApp.

## Other problems seen in the same event (not asked about, reported only)
- **Duplicate customer records:** both arrivals created a new customer for +212656802656 (`9061a3d8…` and `491d3c98…`, 50ms apart). Customer matching races. The job links to `9061a3d8`, so `491d3c98` is an orphan.
- **Wrong company name:** the message says "Dublin Gas" for KN Gas Services Ltd. This comes from Make's template or connection, not our catalogue.
- The message log rows have no customer ID or recipient phone.
- This was KN Gas Services Ltd again, not Cavan Gas.

## Proposed next steps (need approval, one step at a time)
1. Make: send WhatsApp only when the response has `duplicate` not true, or when a new job was created. Also check why Tally/Make delivers twice (a duplicate webhook or a scenario retry).
2. Intake: move customer matching after the guard claim, or make it race-safe, so a duplicate arrival doesn't create a customer.
3. Separate data step: merge or remove the orphan customer `491d3c98`.
4. Fix the company name in the Make template for KN Gas Services Ltd.
