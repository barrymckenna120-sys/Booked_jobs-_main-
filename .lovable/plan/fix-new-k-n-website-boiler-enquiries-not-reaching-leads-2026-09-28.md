# Fix: new K&N website boiler enquiries not reaching Leads

## Findings so far (read-only)
- No lead from form Zjq5rA exists. The last 5 boiler leads all belong to New Gas Boilers Dublin (68qaMe); latest 23/09/26.
- Only one call from Zjq5rA in the last 24h: 28/09/26 20:38 UTC, **refused with 401** (signature check failed). So the lead is rejected before any org, field or duplicate logic runs.
- Zjq5rA is bound to "K&N gas services Ltd" (`c0aa41ac…`) with secret name `TALLY_SIGNING_SECRET_KN_TEST`.
- **Tenant question:** that same org also holds the live booking form (rj6j55, book.kngasservices.ie) and renewal form (rebook.kngasservices.ie). The older "K&N Gas Services" (`8c37827f`) has no Tally forms set. So `c0aa41ac` looks like the real tenant for the new website, not a test org. Needs your confirmation before anything moves.

## Root cause (confirmed by the 401)
The signing secret in Tally and the one saved in the backend don't match.

## Steps
1. You confirm which org is the production K&N tenant for the new website.
2. Confirm the Get a Quote button opens `tally.so/r/Zjq5rA` (check the website link).
3. Reset the secret: you put a fresh random value in Tally (Zjq5rA → Integrations → Webhooks → Signing secret); I open the secure form to save the same value as `TALLY_SIGNING_SECRET_KN_TEST`. No code change.
4. If the confirmed tenant is not `c0aa41ac`, move the Zjq5rA binding in one separate data step and read it back.
5. You submit a fresh enquiry via the live Get a Quote button. I read back: Tally response ID, 200 response, one `boiler_enquiries` row, correct org, status NEW, source `kn-website-new-boiler`, customer link, photos.
6. Screenshot Pipeline → Leads on desktop and mobile signed in to that tenant; check only one lead exists for that response ID.

## If step 5 still returns 401
Temporarily log only whether a signature header is present and its length (never the value) to tell "Tally not sending it" from "values differ". Remove after.
