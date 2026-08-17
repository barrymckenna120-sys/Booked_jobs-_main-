# BJ-B3b — Remove last three tenant-identifying literals (diff proposal only)

Same skip-and-log pattern as B1 / B2a / B2b / B3a. Nothing implemented yet.

## Live exposure check (current config)

| Org | settings.message_footer | cert_prefix | Exposed today? |
|---|---|---|---|
| K&N Gas Services | `K&N Gas Services` | KN | No |
| Dublin Gas | populated | DG | No |
| Webliveview Ltd | populated | WE | No |
| Cavan Gas | **empty string** | null | **Yes** — both footer fallbacks fire |
| wexford gas (x2) | no settings row at all | null | **Yes** — both footer fallbacks fire |

`service_calls`: 493 rows, **0** with a null/blank `job_reference` — so the `KN-` receipt fallback is dead code in practice today, but it is still a live leak for any future row created before a reference is assigned.

---

## 1. send-reschedule-notification (customer-facing — HIGH)

Current, `index.ts:88`:

```ts
let messageFooter = "Karl's Gas Services";
```

Sourcing: `settings.message_footer` looked up by `organisation_id` (line 90), overwritten only when non-blank (line 94). Note the literal is `"Karl's Gas Services"` — not even the current K&N footer string, so it is stale as well as tenant-specific.

Proposed diff (replaces lines 87-96), placed **before** the message is assembled and before the 360 Messenger call:

```ts
// Tenant footer (BJ-B3b). This org's own settings only — no shared fallback.
const settingsRes = await fetch(
  `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${orgId}&select=message_footer&limit=1`,
  { headers: dbHeaders },
);
const settings = await settingsRes.json();
const messageFooter = String(
  (Array.isArray(settings) ? settings[0]?.message_footer : "") ?? "",
).trim();

if (!messageFooter) {
  // skip-and-log: edge_function_logs + message_log(status:'failed'), HTTP 200
  return { success: false, skipped: true, reason: "message_footer_not_configured" };
}
```

Skip payload mirrors B3a exactly: `edge_function_logs` insert (`function_name: "send-reschedule-notification"`, `error_message: "Skipped: message_footer_not_configured for organisation"`), plus a `message_log` row with `message_type: "reschedule_notification"`, `channel: "whatsapp"`, `status: "failed"`, `error_message`, `related_id`/`related_type`, `sent_by: "system"`. HTTP 200.

Untouched: the WhatsApp credential resolver, the customer/phone guards, engineer in-app notification, `customer_activity` insert.

## 2. quote-accepted-alert (internal office alert — LOW severity, still fix)

Current, `index.ts` (settings block):

```ts
const messageFooter = (Array.isArray(settings) && settings[0]?.message_footer)
  ? settings[0].message_footer
  : "K&N Gas Services";
```

Recipient confirmed: the message is sent to `officeNumber = settings.whatsapp_number || settings.business_phone` for the quote's own `user_id`, and the accompanying in-app notification is `role: "office"`. **No customer ever receives this.** Worst case today is Cavan Gas office staff seeing "K&N Gas Services" at the bottom of their own alert — embarrassing and confusing, not a cross-tenant data leak. Severity: low. Recommend fixing anyway for consistency and to stop the literal spreading by copy-paste.

Proposed diff:

```ts
const messageFooter = String(
  (Array.isArray(settings) ? settings[0]?.message_footer : "") ?? "",
).trim();
```

Then, because this is internal-only, prefer a **degrade** over a hard skip: omit the footer line entirely rather than blocking the office alert.

```ts
const alertMsg = `✅ Quote Accepted
...
Job has been created — open BookedJobs to schedule.${messageFooter ? `\n\n${messageFooter}` : ""}`;
```

Plus a non-blocking `edge_function_logs` row with `reason: "message_footer_not_configured"` so the config gap is still visible. If you would rather it behave identically to the customer-facing functions, say so and it becomes a hard skip with the same `message_log` failed row — but that would suppress a useful internal alert over a cosmetic gap.

Untouched: office-number guard, WhatsApp config resolution, `message_log` pending/sent flow, `customer_activity`, in-app notification.

## 3. send-whatsapp-receipt (customer-facing — MEDIUM, dead code today)

Current, `index.ts:102`:

```ts
const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;
```

Proposed tenant-neutral fallback. `settings.cert_prefix` already exists and is populated for K&N (KN), Dublin Gas (DG), Webliveview (WE) but is null for Cavan Gas — so it needs its own fallback, and that fallback must not be a tenant string:

```ts
// Widen the existing settings select to include cert_prefix.
const refPrefix = String(settings?.cert_prefix ?? "").trim();
const jobRef = job.job_reference
  || (refPrefix ? `${refPrefix}-${job.id.slice(0, 6).toUpperCase()}` : `Job ${job.id.slice(0, 6).toUpperCase()}`);
```

No skip guard proposed here: a missing job reference is not a branding leak once the literal is gone, and blocking a paid customer's receipt over a cosmetic reference label would be a worse outcome. The generic `Job XXXXXX` label is tenant-neutral.

Untouched: receipt PDF generation, tenant public URL resolution, existing `no phone` / branding guards, `message_log`, `receipt_sent` update.

## Reason codes

Reuses existing vocabulary — `message_footer_not_configured` follows the `company_name_not_configured` / `company_phone_not_configured` / `missing_renewal_form_url` shape already in use. No new code needed for item 3.

## Verification (on approval)

- Cavan Gas scratch job → reschedule notification returns `skipped: message_footer_not_configured`; raw `edge_function_logs` + `message_log` rows.
- Cavan Gas scratch quote → office alert still sends, footer line absent, log row present.
- K&N scratch job → both happy paths unchanged, correct footer, test recipient only.
- Receipt: scratch job with `job_reference` nulled → confirm `Job XXXXXX` for Cavan Gas and `KN-XXXXXX` for K&N via cert_prefix.
- Cleanup + confirm zero real customers messaged.
