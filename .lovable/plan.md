## Verify & Reconcile WhatsApp Helper Migration Across 6 Edge Functions

### Goal
Confirm the 6 target Edge Functions deployed in Lovable Cloud match the repo (use `getWhatsAppConfig` from `_shared/whatsapp.ts`, no direct `Deno.env.get("THREESIXTY_API_KEY")`), and redeploy any that drift.

### Steps

1. **Repo baseline** — grep each of the 6 function files for:
   - `getWhatsAppConfig` import from `../_shared/whatsapp.ts` (must be present)
   - `Deno.env.get("THREESIXTY_API_KEY")` (must be absent)
   Record pass/fail per file.

2. **Deployed state** — for each function, pull recent logs via `supabase--edge_function_logs` and inspect version/updated-at metadata surfaced there, plus invoke a lightweight probe via `supabase--curl_edge_functions` (OPTIONS or a minimal validation-error request) to confirm the deployed handler responds with the current code's error shape. Cross-check the boot log line each function emits after the migration.

3. **Reconcile** — for any function whose deployed behavior diverges (or whose deployment timestamp predates the migration commit), call `supabase--deploy_edge_functions` with the drifted names and re-probe to confirm the new revision is live.

4. **Report** — table with columns: function name, repo has helper (Y/N), repo has legacy env-var (Y/N), deployed timestamp, matches repo (Y/N), action taken (none / redeployed).

### Out of scope
No code changes to the functions themselves. No behavior changes. Read-only verification + redeploy only if drift is detected.
