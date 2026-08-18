# Receipt footer visual preview — three data scenarios

Goal: see the real `PublicReceipt.tsx` page (real header, real body, real Boiler Details / Notes footer) rendered in three data states, without touching live code, live data, or any existing component.

## Approach: intercept the data call, don't add a scratch route

Rather than adding a preview route or a Storybook-style wrapper (both of which mean new files in the app and a non-production route shipped into the repo), the preview drives the real page in a headless browser and swaps only the API response feeding it.

`PublicReceipt.tsx` gets all its data from a single call: `supabase.rpc("get_receipt_public", { p_receipt_number })`, which returns one JSON object containing business/header fields, customer fields, and the footer fields (`boiler_brand`, `boiler_model`, `warranty_expiry_date`, `next_service_due`, `gprn`, `customer_facing_notes`).

The preview script:

1. Opens the real route `/r/K-045` so the genuine header (logo, business name, RGI, phone, address) and payment block load from real settings.
2. Intercepts `**/rest/v1/rpc/get_receipt_public*`, lets the real request through, then overrides only the customer/footer fields in the response before it reaches React.
3. Screenshots each scenario at desktop (900px, two-column grid) and mobile (430px, stacked grid).

Nothing is written: no DB updates, no new app files, no component changes. The page renders exactly the code that is live today.

## Scenarios captured

1. **Full data** — make/model, in-force warranty (14 Mar 2031), next service due, GPRN, and a multi-line note.
2. **Expired warranty, no notes** — make/model, warranty expiry in the past, next service due, GPRN, `customer_facing_notes` null.
3. **New customer, nothing on file** — boiler brand/model, warranty, next service, GPRN and notes all null, so the whole section should hide.

Six screenshots total (three scenarios x desktop/mobile), shared back inline in chat.

## Why this needs build mode

Plan mode blocks writing the throwaway Playwright script, even under `/tmp` outside the project. The script lives at `/tmp/browser/receipt-preview/preview_scenarios.py` and never enters the repo, but I need write permission to create and iterate on it.

If you would rather have a real in-app preview route instead of screenshots, say so and I will re-plan around a clearly marked non-production route — but that does add files to the project, which your read-only framing rules out.

## Technical notes

- Interception target: `POST {SUPABASE_URL}/rest/v1/rpc/get_receipt_public`.
- Response fulfilled as `application/json` with the merged object; the earlier attempt failed only on Playwright response-handling details (`resp.json()` vs `json.loads(await resp.text())` and header passthrough), which the corrected script fixes.
- Scenario 3 exercises the `showDetailsSection` guard; scenario 2 exercises the `ShieldOff` / muted "Warranty Expired" branch and the `-` notes empty state.
