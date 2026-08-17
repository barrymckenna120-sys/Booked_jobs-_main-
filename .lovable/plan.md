# BJ-B3c — generic "our team" fallbacks (diff proposal only)

## Confirmed lines and fallback chains

**`supabase/functions/send-part-arrived/index.ts`**
- Line 105: `let messageFooter = "our team";`
- Lines 106-113: reads `settings.message_footer, business_name, company_name` for the org, then
  `messageFooter = settings[0].message_footer || settings[0].business_name || settings[0].company_name || messageFooter;`
- Footer is appended once: `const message = \`${baseMessage}\n\n${messageFooter}\`;` (line 117)

**`supabase/functions/send-upcoming-reminders/index.ts`**
- Line 57: `messageFooter = s?.message_footer || s?.business_name || s?.company_name || "our team";` inside the per-org `loadOrgConfig` cache
- Footer is used **twice** in the reminder body (header line and sign-off, lines 148-157)

## Severity: downgrade, don't treat as B1-class

This is not the same defect class as B1/B2a/B2b/B3a/B3b. Those fell back to *another tenant's* identity (K&N name, K&N phone, K&N Tally link, K&N job prefix) — a real cross-tenant leak. `"our team"` is tenant-neutral: no tenant's data reaches another tenant's customer. It is a branding/UX gap: the customer gets an unsigned, slightly anonymous message. Correct severity: **low / consistency**, not critical.

Both functions already have the real guards that matter (org resolution, WhatsApp credential resolution, opt-out in `send-upcoming-reminders`), so a misconfigured tenant can already never send with someone else's credentials.

## Live exposure

| Org | Resolved footer | Exposed today |
|---|---|---|
| K & N Gas Services | `K&N Gas Services` | no |
| Dublin Gas | full footer line | no |
| Webliveview Ltd | full footer line | no |
| Cavan Gas | `Cavan Gas` (via `business_name`) | no — `message_footer` blank but chain resolves |
| wexford gas (2 rows) | none (no settings row) | yes in theory |

The two `wexford gas` orgs have no `settings` row at all, so they would hit `"our team"`. They have **zero** `service_calls`, so neither function can currently fire for them. Practical live exposure today: **none**.

## Proposed diffs

### 1. `send-upcoming-reminders` — hard skip (matches the B-series pattern)

Automated bulk outreach, no human in the loop, and the footer appears twice in the body — an unsigned reminder is the worst version of this. Treat a blank branding chain exactly like a missing WhatsApp credential (that skip already exists a few lines above).

In `loadOrgConfig`, after the settings read:

```ts
const resolved = (s?.message_footer || s?.business_name || s?.company_name || "").trim();
if (!resolved) {
  await supabase.from("edge_function_logs").insert({
    function_name: "send-upcoming-reminders",
    error_message: `Branding not configured for org ${orgId} — skipping reminders`,
    payload: { organisation_id: orgId, reason: "message_footer_not_configured" },
  });
  orgCache.set(orgId, null);
  return null;
}
const cfg = { apiKey, messageFooter: resolved };
```

Per-job effect: the existing `if (!orgCfg)` branch already increments `skipped` and pushes a result row — only its `error` string needs widening to `"Branding or WhatsApp integration not configured"`. No `message_log` row per job (the function only writes `message_log` at send time, and a bulk run would otherwise spam one failed row per job); the single `edge_function_logs` row per org per run is the audit trail — same dedup principle approved for `send-area-bulk-whatsapp`.

Reason code: `message_footer_not_configured` (already used in `send-reschedule-notification`).

### 2. `send-part-arrived` — degrade, don't skip

Same spirit as `quote-accepted-alert`: this is an office-initiated, one-at-a-time click from the Parts panel ("Send Message"), telling a waiting customer their part has arrived. Blocking it on a blank footer would break a live operational action for a cosmetic reason, and the office user would see a confusing failure toast.

Proposed: remove the `"our team"` literal and omit the footer line when nothing resolves.

```ts
let messageFooter = "";
// …existing settings fetch…
if (Array.isArray(settings) && settings[0]) {
  messageFooter = (settings[0].message_footer || settings[0].business_name || settings[0].company_name || "").trim();
}

const message = messageFooter ? `${baseMessage}\n\n${messageFooter}` : baseMessage;
```

Plus a non-blocking `edge_function_logs` row when `messageFooter` is empty (`reason: "message_footer_not_configured"`, note `degraded: true`) so the gap is visible without failing the send. No change to the response shape — the caller (`PartsPanel.tsx`) still gets `{ success: true }`.

### 3. Not touched

Opt-out guard, WhatsApp credential resolution, `message_log` / `customer_activity` writes, response shapes, `PartsPanel.tsx`, and every existing skip condition stay exactly as they are.

## Verification plan (on approval)

- Scratch org/settings state with a blank branding chain: confirm `send-upcoming-reminders` skips with one `edge_function_logs` row per org and zero `message_log` rows; confirm `send-part-arrived` still sends with the footer line absent and a `degraded` log row present.
- K&N scratch job for both: happy path unchanged, correct footer, footer still appearing twice in the reminder body.
- All sends to the internal test number only; scratch rows deleted and absence confirmed.
