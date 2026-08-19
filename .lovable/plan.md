# CustomerIntegrationsTab handleSave empty-string patch fix

## Problem
`handleSave` in `src/components/admin/CustomerIntegrationsTab.tsx` merges every field in a section into the existing `tenant_integrations` config using `{ ...prev, ...patch }`. Fields the user left blank are still present in `patch` as `""`, so saving one section can overwrite unrelated stored keys with empty strings.

## Fix
Inside `handleSave`, after building `patch` for each integration_type and before constructing the upsert rows, filter out any key whose value is `""`, `null`, or `undefined`.

```text
// before (lines 148-154)
const rows = Object.entries(byType).map(([integration_type, patch]) => {
  const prev = ...
  return {
    organisation_id: orgId,
    integration_type,
    config: { ...prev, ...patch },
  };
});

// after
const rows = Object.entries(byType).map(([integration_type, patch]) => {
  const prev = ...
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== "" && v != null)
  );
  return {
    organisation_id: orgId,
    integration_type,
    config: { ...prev, ...cleaned },
  };
});
```

## Scope limits
- No new UI controls.
- No changes to load logic, field rendering, secret fields, other sections, or variable names.
- Only this one filter step is added.

## Verification
- After the change, saving a section with untouched blank fields must send a `patch` that omits those keys, so existing config values are preserved.
- User will live-verify on K&N: edit Stripe only → confirm SumUp intact, then edit SumUp only → confirm Stripe intact.
