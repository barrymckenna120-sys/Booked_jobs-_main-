# BJ-0110 Follow-up — Correct SumUp sandbox testing setup

## What the lookup found
- The cards tried on DG-434 (`4200…0091`, `4200…0026`, `5200…0007`) ARE SumUp's documented frictionless-success test cards — the numbers were never wrong.
- `merchant_sandbox: true` is **not a documented SumUp parameter** (absent from the full developer docs). Sandbox testing requires a **separate sandbox merchant account** with its own merchant code and API key.
- M9Z8RGV6 is a live merchant → test cards hit the real ACI/oppwa 3DS stack and decline, as observed.
- No 3DS OTP exists; SumUp's sandbox auto-resolves challenges.

## Plan
1. **User action (cannot be done in code):** In the SumUp Dashboard → Developer Settings → Sandboxes tab, create a sandbox merchant account; note its merchant code and generate a sandbox API key.
2. Store the sandbox merchant code + key under distinct secret names (never overwrite `SUMUP_API_KEY` or the Dublin Gas live keys), e.g. `SUMUP_SANDBOX_API_KEY` / per-org sandbox config in `tenant_integrations`.
3. Add a clearly-labelled "sandbox mode" toggle for Dublin Gas payment-link testing that resolves to the sandbox merchant credentials instead of the live ones.
4. Re-run a scratch checkout (scratch job, test number) with card `4200 0000 0000 0091`, any future expiry, any CVV — expect frictionless success and a PAID webhook.
5. Regression: verify live-merchant path (M9Z8RGV6) is untouched and still default.

## Out of scope
- No changes to live payment routing, webhook logic, or checkout creation defaults.
