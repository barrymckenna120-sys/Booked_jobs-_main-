Both previous plan submissions were interrupted before reaching you, so the approval button never appeared and I'm still locked in plan mode. Approving this one switches me to build mode and I'll apply both parts immediately, then show the real diffs.

Nothing here is applied yet — `backfillCustomerGprn` does not exist in the codebase.

## Part A — GPRN write-back on certificate save

Only writes when the customer's `gprn` is null or empty. If the customer already has a GPRN and the cert value differs, the customer record is left alone.

New file `src/lib/backfillCustomerGprn.ts`:

```ts
export async function backfillCustomerGprn(customerId?: string, gprn?: string) {
  const value = (gprn || "").trim();
  if (!customerId || !value) return;
  try {
    await supabase
      .from("customers")
      .update({ gprn: value })
      .eq("id", customerId)
      .or("gprn.is.null,gprn.eq.");   // never overwrites an existing value
  } catch (_e) { /* non-blocking */ }
}
```

The `.or(...)` filter does the "only if empty" test in the database — no read-then-write race, no path that can clobber an existing value.

Called once, not awaited, in the insert-success branch of:
- `src/components/engineer/Cert2Flow.tsx` (~L216)
- `src/components/engineer/Cert3Flow.tsx` (~L196)
- `src/components/engineer/GasInstallationFlow.tsx` (~L198)
- `src/components/engineer/GasInstallationCertForm.tsx` — in `handleSave`, after a successful insert or update

Not called on the offline retry-queue path (that fires only when the save itself failed).

## Part B — GPRN on certificate list rows

GPRN sources: `certificates.notes.gprn` (JSONB) and `cert2_certificates.gprn` (column). Hazard notices don't store one, so no line for them.

`src/components/engineer/JobCertsTab.tsx`
- Add `gprn: string | null` to `CertDoc`.
- cert1 rows read `(c.notes as any)?.gprn` — `notes` already selected, no query change.
- cert2 rows: add `gprn` to the `cert2_certificates` select (L40) and map it.
- Conditional `text-xs text-muted-foreground` line under the created date: `GPRN {value}`.

`src/pages/engineer/EngineerCertificates.tsx`
- `fetchData()` already does `.select("*")` — no query change.
- Add `gprn` to the `allDocs` mapping (~L88); render the same conditional line in the existing `text-[11px] text-muted-foreground` style.

Rows without a GPRN render exactly as today — line omitted, not a dash.

## Unchanged

Cert payloads, validation, numbering, PDF generators, WhatsApp sending, offline queue, `CertificateViewer.tsx`, `CustomerHazardNotices.tsx`, quotes/invoices/receipts. No migration needed.

## Risk

Low — one guarded non-blocking UPDATE per cert save, two presentational additions, one extra selected column.
