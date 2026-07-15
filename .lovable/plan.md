## Status

Both parts of the previously-approved plan already executed:

1. **Code fix applied** — `CustomerIntegrationsTab.tsx` now writes the two Tally URL fields to `integration_type: 'tally'` under keys `new_booking_url` / `renewal_form_url`, matching `IntegrationsTab.tsx`. Both pages share one row.
2. **Orphan rows deleted** — the two Dublin Gas rows (`tally_new_booking`, `tally_rebook`, both `{"form_url":""}`) are gone. K&N and Cavan never had orphan rows to begin with.

## Current `tally` integration state (source of truth going forward)

| Org | new_booking_url | renewal_form_url |
|---|---|---|
| K&N Gas Services | `https://book.kngasservices.ie/` | `https://rebook.kngasservices.ie/` |
| Dublin Gas | `https://tally.so/r/DUBLINGAS` *(placeholder)* | `https://tally.so/r/DUBLINGAS_RENEW` *(placeholder)* |
| Cavan Gas | *(empty)* | *(empty)* |
| Webliveview Ltd | *(empty)* | *(empty)* |

## No further action proposed

There is nothing left to do under the original ask. Two obvious follow-ups you may want, but I'm not planning them without your say-so:

- **Backfill Dublin Gas's real Tally URLs** (the current values are still the `DUBLINGAS`/`DUBLINGAS_RENEW` placeholders from the earlier audit).
- **Verify in-app**: open `/admin` → Customer Integrations → Dublin Gas, confirm the two Tally fields show the placeholder URLs; save a test edit; open tenant Settings → Integrations and confirm the same value appears.

Tell me which (if either) you want and I'll write a scoped plan.