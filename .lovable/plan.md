## Small refinements to ImportCustomers footer + preview

Scoped edits to `src/pages/ImportCustomers.tsx` only.

### 1. Editable cells (no change needed)
Preview cells (Name / Phone / Address / Eircode) already render as `<EditableCell>` for every row regardless of validity — the red ring appears only when a field has an error, but the input itself is always editable. No code change required; confirming behaviour matches the ask.

### 2. Drop the "Needs check" chip
- Remove the `Needs check: 0` badge from the sticky footer.
- Remove the now-unused `needsCheckCount` local.
- Footer left side shows only two chips: `Ready: N` (success) and `Blocked: N` (destructive).

### 3. Sticky footer
- Keep as-is: fixed to bottom, Ready + Blocked chips on the left, Import button on the right with the existing dynamic label / disabled logic.

### Out of scope
- No changes to parsing, validation, mapping UI, pagination, or import logic.

### Deliverable
Diff of `src/pages/ImportCustomers.tsx` showing the footer edit.
