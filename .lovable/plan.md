
# Step 10 — Tally Intake Hardening

Scope: 3 edge functions + 1 migration. Diff-first, no deploy until approved.

## 1. Shared-secret auth (`tally-incoming-job`, `tally-boiler-rebook`)

Add at the top of each handler (after CORS preflight, before body parse):

```ts
const providedSecret = req.headers.get("x-webhook-secret");
const expectedSecret = Deno.env.get("MAKE_WEBHOOK_SECRET");
if (!expectedSecret || providedSecret !== expectedSecret) {
  return new Response(
    JSON.stringify({ success: false, error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

Also add `x-webhook-secret` to `Access-Control-Allow-Headers` in `corsHeaders`.

**Caller impact check**: Both functions are called only from Make.com scenarios (confirmed in prior audit — zero in-app references). Make scenarios must be updated in parallel to send the header. Flag this in the report so the user can update Make before deploy.

## 2. Idempotency (`tally-incoming-job`)

**Payload field**: `tally-webhook` (the orphan) reads `body.eventId ?? body.id`. `tally-incoming-job` currently reads neither. Extract with same fallback:

```ts
const submissionId = sanitize(
  body.tally_submission_id ?? body.eventId ?? body.id ?? null,
  MAX_SHORT_LEN,
);
```

**Pre-insert check** (after org resolution, before customer upsert):

```ts
if (submissionId) {
  const { data: existingJob } = await supabase
    .from("service_calls")
    .select("id, customer_id")
    .eq("tally_submission_id", submissionId)
    .eq("organisation_id", orgData.id)
    .maybeSingle();
  if (existingJob) {
    return new Response(
      JSON.stringify({ success: true, id: existingJob.id, customer_id: existingJob.customer_id, duplicate: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
```

**Write on insert**: Add `tally_submission_id: submissionId` to the `service_calls.insert(...)` payload.

**Race note**: Pre-check + unique index is the correct pattern. The pre-check handles the common case (Make retry seconds/minutes later). The unique index handles the true race (two concurrent requests) — if the second insert violates the unique constraint, catch it and re-query to return the existing row rather than 500. Added to the insert error handler.

## 3. Unique index migration

```sql
CREATE UNIQUE INDEX IF NOT EXISTS service_calls_tally_submission_id_key
  ON public.service_calls (tally_submission_id)
  WHERE tally_submission_id IS NOT NULL;
```

Partial index — NULLs (historical rows and non-Tally jobs) are unaffected.

## 4. Phone normalization (`tally-boiler-rebook`)

Extract the current inline normalization from `tally-incoming-job` (lines 101–108) into a local helper in each file (or inline copy — no shared module to keep scope tight). Apply to `body.phone` before the `customers` lookup. Use the normalized value in the `.eq("phone", ...)` query.

## 5. Disable `tally-webhook`

Replace the entire handler body with:

```ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "Gone",
      message: "tally-webhook is retired. Use tally-incoming-job.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
```

Keep the file so any stray caller gets a loud 410 rather than a 404.

## Deliverable order

1. Write file changes + migration.
2. Post full diff to chat.
3. Wait for approval (user wants to review idempotency + auth-header impact).
4. On approval: run migration, deploy the 3 functions.

## Out of scope

- Deleting `tally-webhook` from Supabase (keep as 410 gone).
- Refactoring shared helpers across the two live functions.
- Changing `tally-webhook` payload parsing (dead code path).
