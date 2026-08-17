# SumUp admin UI — status and remaining evidence

## Status: implemented

The SumUp section exists in `src/components/admin/CustomerIntegrationsTab.tsx` with two fields:

- `SumUp Merchant Code` (`merchant_code`, plain text, placeholder `MBBMEYG7`)
- `SumUp API Key Secret Name` (`api_key_secret`, masked secret field, placeholder `SUMUP_API_KEY_KN_GAS`)

## Evidence gathered now (read-only)

### 1. K&N SumUp section as displayed after loading the tab

Rendered values in the SumUp block on K&N's organisation detail (Integrations):

```text
sumup                Active   Edit  Delete
environment          sandbox
merchant_code        MBBMEYG7
api_key_secret       ••••_KEY
```

The masked `••••_KEY` matches the existing secret-field masking behaviour (last 4 chars of `SUMUP_API_KEY`). Editable inputs are only mounted after pressing Edit on the SumUp block.

### 2. Raw `tenant_integrations` row for K&N, `integration_type = 'sumup'` (before any test save)

```text
id:              4d1dc5b4-cc2e-441e-9f64-bbd0de4e479b
organisation_id: 8c37827f-ce2c-4507-a821-a5e807d89856  (K&N Gas Services)
integration_type: sumup
is_active:       true
config:          {"api_key_secret": "SUMUP_API_KEY", "environment": "sandbox", "merchant_code": "MBBMEYG7"}
created_at:      2026-08-06 13:18:03.585371+00
updated_at:      2026-08-06 13:18:03.585371+00
```

Cavan Gas current row (for comparison in step 3):

```text
id:              3a62919f-dccb-4822-88ac-6d93934d54bc
organisation_id: 62d6c1c3-99cc-47fa-80ce-ea0e36f0d52b  (Cavan Gas)
config:          {"api_key_secret": "", "merchant_code": ""}
updated_at:      2026-08-17 17:13:15.766212+00
```

## Remaining steps (need approval — they write data)

Steps 3 and 4 require an actual save through the UI, which is a write. Plan mode blocks writes, so approve this to run:

1. Open Cavan Gas → Integrations → Edit the SumUp block, type `MCAVAN01` into SumUp Merchant Code, save.
2. Paste the raw `tenant_integrations` row for Cavan Gas showing the new value and bumped `updated_at`.
3. Re-fetch K&N's `sumup` row and paste it, proving it is byte-identical to step 2 above (same `config`, same `updated_at` of `2026-08-06 13:18:03.585371+00`).
4. Cleanup: reset Cavan Gas `merchant_code` back to `""` through the same UI field and confirm the row.

No code changes are needed; this is verification only.
