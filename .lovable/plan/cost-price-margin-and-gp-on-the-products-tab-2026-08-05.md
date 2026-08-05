# Cost Price, Margin % and GP € on the Products tab

Scope: `src/pages/Products.tsx` only. Category `Select`, Categories tab, and the `categories`
table are untouched.

## Database

No migration needed. `products.cost_price` exists (numeric, nullable) and is present in the
generated types, so no schema or type work is required.

## Role gating

Reuse the existing pattern:

```
const { user } = useAuth();
const { canAccessOffice } = useUserRole(user);
```

Every cost-related element (dialog field, Cost column, Margin %, GP €) renders only when
`canAccessOffice` is true. Engineers see the Products tab exactly as today — same columns,
same dialog.

## Add/Edit dialog

One addition, directly below the existing Unit Price field, office/admin only:

- Label `Cost Price €`, numeric `Input`, optional.
- Form state gains `cost_price: string` (empty string = not set); populated from the product
  on edit (`p.cost_price == null ? "" : String(p.cost_price)`), empty on add.
- On save the payload adds:
  `cost_price: form.cost_price === "" ? null : parseFloat(form.cost_price)`.
- Existing name/unit_price validation, active switch, and category select unchanged.

## Table columns

Office/admin only, added after the existing Price column:

- **Cost** — `€x.xx`, or "—" when `cost_price` is NULL.
- **Margin %** — `(unit_price - cost_price) / unit_price * 100`, one decimal.
- **GP €** — `unit_price - cost_price`.

Rules:

- NULL `cost_price` → "—" for both Margin % and GP € (never treated as 0).
- `unit_price` of 0 → "—" for Margin % (no divide-by-zero), GP € still shown.
- Computed client-side on render; nothing extra is stored or queried.
- Headers hidden together with the cells so the row/column counts always match.

## Note on the cut-off request

Your message ended mid-sentence after the dialog section, so the Margin %/GP € details above
follow the spec you gave earlier for this feature (office/admin only, client-side, "—" when
cost is NULL). Say the word if you wanted different placement or formatting.

## Untouched

Categories tab and `CategoriesTab`, the category filter buttons, the category `Select`, search,
show-inactive toggle, soft delete, and all existing product queries.
