## Audit of the other two renewal functions (before deciding scope)

**`renewal-reminder-14` and `renewal-reminder-30`** — already read `tenant_integrations.tally.renewal_form_url` and DO build a full Tally URL with query params (then optionally shorten via `create-booking-link`). They pass `tally_url` in their JSON response — the actual send happens downstream (Make/Zapier picks up the list and sends via WhatsApp), so the link is present in those flows today.

**However**, both have a concerning fallback: if a tenant's `tally` row is missing, they silently fall back to `https://tally.so/r/RGJDy4` — **K&N's form**. Dublin Gas currently has a real URL so it's fine today, but the pattern is a cross-tenant leak waiting to happen (any new org without a tally row → their customers get sent to K&N's booking form).

**`renewal-reminder-7`** — only returns a list of candidates, no message assembly. Not affected.

**`send-renewal-reminder`** (the "Send Reminder" button on `/renewals`) — the only sender with the actual gap: no link at all in the template.

---

## Recommendation on scope

You're right that this is broader than today's Dublin Gas setup work. I'd suggest **two separate tasks**:

- **Task A (small, ship now if you want):** Fix `send-renewal-reminder` only — the manual "Send Reminder" button. Contained, low-risk, directly benefits Dublin Gas today.
- **Task B (defer, note it):** Harden the fallback in `renewal-reminder-14`/`-30` — remove the hardcoded K&N URL fallback, skip the customer + log to `edge_function_logs` instead. This is a shared-pattern fix and deserves its own review.

Below is the plan for **Task A only**. Task B I'd note and come back to.

---

## Task A: Update `send-renewal-reminder` to include the rebooking link

### Files changed
- `supabase/functions/send-renewal-reminder/index.ts` (only)

### Logic
1. After resolving `companyName` / `companyPhone`, query `tenant_integrations` for `integration_type = 'tally'` for the customer's `organisation_id`, read `config.renewal_form_url`.
2. Normalise the customer's phone using the same `+353XXXXXXXXX` logic already in the file (or the shared helper if it's already imported — check first).
3. **If `renewal_form_url` is a non-empty string:** build `${renewal_form_url}?customer_phone=${encodeURIComponent(normalisedPhone)}` and use the template with the "Book online:" line.
4. **If missing/empty:** fall back to the current template (reply here or call). No blank URLs sent.
5. Do NOT hardcode any fallback URL — no cross-tenant leak risk.

### Template (link variant)
```
Hi {first_name},

This is {companyName}. Your annual boiler service is due on {renewal_date}.

If your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.

Book online: {renewal_form_url}?customer_phone={normalisedPhone}

Or reply here or call us on {companyPhone}.

Reply STOP to unsubscribe.
{companyName}
```

### Verification before deploy
- Show the full diff.
- Manually trace both cases:
  - K&N (has `renewal_form_url = https://tally.so/r/RGJDy4`) → link variant, phone appended.
  - Dublin Gas (has `renewal_form_url = https://tally.so/r/Zjgxva`) → link variant, phone appended.
  - Hypothetical org with no tally row → fallback variant, no broken link.
- After deploy: one live test send per org (K&N + Dublin Gas), inspect `message_log.content` for the literal text.

### Not in scope
- `renewal-reminder-14` / `renewal-reminder-30` fallback hardening (Task B, separate).
- No template/wording changes beyond adding the "Book online:" line.
- No changes to Renewals UI, cron, or `create-booking-link`.

---

**Your call:** ship Task A now, or park it and finish Dublin Gas core Tally setup first? If you want to ship, approve and I'll produce the diff.