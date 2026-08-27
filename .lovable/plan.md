# Renewal/Warranty Form URL — admin label fix + Cavan end-to-end proof

Parts 0, 2 and 3 are answered/already done (see chat). What remains is a label correction in the admin panel and the Cavan verification pass.

## Part 1 — Relabel, don't add

`src/components/admin/CustomerIntegrationsTab.tsx` line 28 already holds the field:

```ts
{ type: "tally", key: "renewal_form_url", label: "Rebooking Form URL", placeholder: "https://tally.so/r/..." }
```

That is the same `renewal_form_url` key the warranty function reads. Adding a second input for it would give two boxes writing one value, with whichever renders last winning on save.

Change: label becomes **"Renewal/Warranty Form URL"**, plus a `help` string (the section already renders `help` text for the SumUp fields) saying this link is used for both rebooking and warranty reminders, and that a blank value makes warranty sends skip rather than fall back.

Copied-from: nothing new is created — this is the existing `new_booking_url` / `renewal_form_url` field pair in the `SECTIONS` "Booking & Rebooking" block, reused as-is.

Also aligned for consistency: `src/components/settings/IntegrationsTab.tsx` line 158 labels the same key "Renewal Booking URL" on the tenant-facing Settings screen. Same label and help text applied there so the two screens don't disagree about one field.

No schema change. `renewal_form_url` is a key inside `tenant_integrations.config` (jsonb), not a column — no migration needed, and none is proposed.

## Part 3 — Confirming, not changing

`supabase/functions/send-warranty-whatsapp/index.ts`:
- Lines 257-279: reads `tenant_integrations(tally).config.renewal_form_url` for the org being processed. No hardcoded K&N URL anywhere in the file.
- Lines 288-299: missing value logs `missing_renewal_form_url` and returns 200 `{ success: true, skipped: true }` — never throws.
- `warranty-auto-send` calls this function once per customer and counts non-OK responses into `day14_failed` / `day28_failed` before continuing, so one tenant's missing URL cannot stop other tenants in the same run.

Nothing to change here. If verification contradicts any of the above, I stop and report instead of patching around it.

## Part 4 — Verification

1. Show the diff of the label change (admin tab + settings tab).
2. K&N read-back: already correct at `https://rebook.kngasservices.ie/`. No write to K&N. Re-run the SQL read after the label change to prove the relabelled field still points at the same populated key.
3. **Cavan set (data write — its own step):** set Cavan Gas's Renewal/Warranty Form URL through the relabelled admin field in the live UI, then SQL read-back to confirm it saved to `config.renewal_form_url` on Cavan's `tally` row and that no other tenant row changed.
4. **Cavan send:** trigger `send-warranty-whatsapp` for the Cavan scratch customer `e43c42f0-0b0e-43d0-8e5b-b4c427f4fb42`, `message_type: "warranty_day14"`. This is a real outbound WhatsApp to that scratch record's number — approving this plan approves that one send. Report the verbatim response, the exact message body, and the `message_log` row, confirming the link is Cavan's test value and contains no `kngasservices.ie`.
5. **Cavan blank:** clear the field via the admin UI, re-trigger the same call, confirm the 200 `skipped: true` / `missing_renewal_form_url` response and the `edge_function_logs` row — proving skip, not fallback.
6. **Hygiene:** leave Cavan blank afterwards, matching its current state (both Tally URLs empty), so the test leaves no residue. Stated explicitly in the final report.

## Risk

Low. Part 1 is presentation-only — labels and help text, no key or save-path change. The only behavioural surface is the two Cavan writes in verification, both on a test tenant with a scratch customer, both reverted at the end.
