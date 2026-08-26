# BJ-next-E — SumUp sandbox mode: audit findings + plan

## Audit findings (read-only, confirmed)

### 1. `tenant_integrations` schema (current)
```
id              uuid        PK, default gen_random_uuid()
organisation_id uuid        NOT NULL
integration_type text       NOT NULL   ('sumup' rows)
config          jsonb       NOT NULL, default '{}'
is_active       boolean     NOT NULL, default true
created_at / updated_at     timestamptz
```
Current 'sumup' rows: Dublin Gas (`merchant_code: M9MEJM9K`, `api_key_secret: SUMUP_API_KEY_DUBLIN_GAS`, `environment: live`, `environments.live: {...}`); one empty-config org; one test org on the shared `SUMUP_API_KEY`. **The `config` JSONB already carries an `environment` field and a per-environment `environments` map** — no structural change is needed to store sandbox credentials.

### 2. Every place SumUp credentials are read
- `_shared/sumupCredentials.ts:43` — `resolveSumUpCredentials` (single resolver). Consumers:
  - `sumup-payment-webhook/index.ts:98`
  - `send-payment-link/index.ts:111`
  - `_shared/depositLink.ts:173` (used by quote/deposit paths)
- Direct (non-resolver) reads of `tenant_integrations`:
  - `sumup-integration/index.ts:150,251,258,384` — settings management endpoint (writes config; expected)
  - `sumup-payment-webhook/index.ts:222` — second direct read (org lookup by merchant code; flagged for review during implementation)
- Webhook secret: `SUMUP_WEBHOOK_SECRET` is one global env secret (`sumup-payment-webhook:150`, `send-payment-link:137`, `depositLink.ts:190`, `sumupWebhook.ts:349`). Sandbox checkouts hit the same webhook URL and route to the org via `checkout_reference` — **no webhook change required**.

### 3. Schema options — tradeoffs
- **Option A — mode column / separate credential columns:** Unnecessary migration; the JSONB `config.environments.{live,sandbox}` map already provides per-mode credential slots, and `config.environment` is the mode switch. Adding columns duplicates existing storage and risks drift.
- **Option B — second row `integration_type='sumup_sandbox'`:** Breaks every existing reader (`makeRestSumUpConfigLoader` filters `integration_type=eq.sumup&limit=1`), duplicates RLS surface, and two-row lookups invite exactly the silent-fallback failure mode the ticket forbids.
- **Recommended: keep the existing JSONB shape (Option A-equivalent, zero migration).** The resolver will be mode-aware: read `config.environment`; when `'sandbox'`, resolve **only** from `config.environments.sandbox` (`merchant_code` + `api_key_secret`). Missing/incomplete sandbox config → hard error (`sumup_sandbox_config_incomplete`), never fall back to live. Sandbox mode OFF (`environment: 'live'` or absent) → today's behavior byte-for-byte. Silent fallback is impossible because the resolver has no fallback path at all (verified: no global key fallback exists anywhere in the codebase).

### 4. Existing UI — yes, no new UI from scratch
- Superadmin admin panel `src/pages/admin/TenantDetail.tsx` (client-gated to `profiles.role === 'superadmin'` at :162-186) with `CustomerIntegrationsTab.tsx` SumUp fields, backed by the `sumup-integration` edge function (server-side superadmin check, 403 otherwise).
- Tenant-facing `SumUpIntegrationCard.tsx` also exists.
- Plan: add a Live/Sandbox environment toggle to the superadmin `TenantDetail` integrations tab (superadmin-only surface), saving via `sumup-integration`. The tenant self-service card shows current mode read-only but cannot flip it.

### 5. Toggle permission — superadmin-only, as recommended
- Enforcement: `sumup-integration` already requires superadmin for writes (:102-123); the toggle goes through that function only.
- **Gap found:** RLS on `tenant_integrations` lets *any authenticated org member* write the org's rows directly via PostgREST (policy `"Org scoped access"`, migration 20260511092620). A rogue org member could flip `config.environment` bypassing the function. Mitigation in scope: a restrictive RLS policy or trigger limiting writes to `environment`/`environments` keys to superadmins (or a DB trigger rejecting non-superadmin changes to those keys).

## Implementation (after approval)

1. **Resolver:** extend `_shared/sumupCredentials.ts` with mode-aware resolution + `sumup_sandbox_config_incomplete` hard-fail error. No signature changes for callers.
2. **Settings function:** `sumup-integration` — support saving per-environment credentials and flipping `environment` (superadmin-only, validated `'live'|'sandbox'`); default `environment: 'live'` on every save where absent. Update `test` action to report which mode was tested.
3. **UI:** Live/Sandbox toggle + sandbox credential fields in `TenantDetail.tsx` integrations tab; read-only mode badge on `SumUpIntegrationCard.tsx`.
4. **DB guard:** restrictive policy/trigger so non-superadmin writes cannot modify `environment`/`environments` keys.
5. **Secrets:** real sandbox key stored as `SUMUP_API_KEY_DUBLIN_GAS_SANDBOX` (existing name; user replaces value once Barry creates the sandbox merchant). No existing secret is overwritten.
6. **Webhook:** unchanged (routes by `checkout_reference`).
7. **Review the second direct read** in `sumup-payment-webhook:222` and align it with the resolver if it duplicates credential logic.

## Verification
- Deno unit tests: sandbox ON + complete config → sandbox creds; sandbox ON + incomplete → hard fail, no fallback; sandbox OFF → live creds unchanged.
- Full existing SumUp test suite green.
- Manual: toggle sandbox ON for Dublin Gas only; confirm K&N checkout creation unaffected (tenant isolation); confirm a sandbox checkout is created against the sandbox merchant once real sandbox creds arrive.

## Out of scope
- No change to live payment routing defaults; sandbox OFF by default for all orgs including future ones.
- No webhook logic changes.
- Creating the actual SumUp sandbox merchant account (Barry, in SumUp Dashboard).
