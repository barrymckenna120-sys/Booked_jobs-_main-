# Expand public Fault Finder to Vaillant, Viessmann, Worcester Bosch

User has reviewed all 30 codes (pasted in chat) and the pre-change counts: 3 draft models, 30 draft codes, 0 excluded, 0 already published.

## Steps (in order, each verified before the next)

1. **Code change (only one):** Add `Vaillant`, `Viessmann`, `Worcester Bosch` to the allowed-brand list in `public-fault-lookup` (handler.ts). No other function changes. Redeploy the function.
2. **Data change:** `UPDATE boiler_fault_codes SET status='published', verified_at=now()` for the 30 codes on these 3 models, excluding any `draft_test_excluded` rows (none exist, but the guard stays in the SQL). Then `UPDATE boiler_fault_models SET status='published'` for the 3 models. SQL read-back to confirm exactly 3 models / 30 codes published and no other rows touched.
3. **Verify publicly:** Call `action=models` for each brand with `Origin: https://kngasservices.lovable.app` and paste all three responses. Spot-check one `action=lookup` per brand.

## Technical details

- Models: Vaillant `ecoTEC plus VU, VUW ..6/5-5` (10 codes), Viessmann `Vitodens 100-W, Type BPJA, 6.5 to 25.0 kW` (10), Worcester Bosch `Greenstar 4000 GR4700iW C` (10).
- Noted data-quality caveats (no changes planned): Viessmann explanations are thin ("Burner blocked" x8); Worcester Bosch includes 6 non-fault "status" codes (200–208).
- No changes to CORS, secrets, RLS, or any other brand's data.
