## Editable Preview + Pagination + Sticky Footer for Customer Import

Scoped changes to `src/pages/ImportCustomers.tsx` only.

### 1. State additions
- `rowEdits: Record<number, Partial<RawRow>>` — session-only overrides keyed by row index.
- `page: number` — current page (1-indexed), default 1.
- `PAGE_SIZE = 10` constant.

### 2. Refactor validation
- Extract `buildRow(raw, index, mapping, existingPhones)` helper from the current `runRowValidation` loop so a single row can be re-validated.
- Add `revalidateRow(index)` that merges `rowEdits[index]` over the original raw row and replaces `previewRows[index]` in place.
- Initial `runRowValidation` keeps current behavior; just calls `buildRow` per row.

### 3. EditableCell sub-component
- Renders an `<input>` bound to `rowEdits[index]?.[field] ?? raw[field]`.
- `onChange` writes to `rowEdits` (session-only, never mutates original parsed data).
- `onBlur` triggers `revalidateRow(index)`.
- Applied to every mapped column in the preview table.
- Cells with a field-level error get a red ring; cells without get default styling.
- Field-level error message renders directly under the input when present.

### 4. Pagination
- Slice `previewRows` by `page` for rendering: `rows.slice((page-1)*10, page*10)`.
- Controls below the table: Prev / `Page X of N` / Next. Disabled at bounds.
- Resets to page 1 whenever a new file is parsed or mapping changes.

### 5. Sticky footer summary
- Fixed to bottom of the import panel (`sticky bottom-0`), matches existing surface tokens.
- Left: chips for `Ready: N`, `Blocked: N`, `Needs check: 0` (placeholder, acknowledged).
- Right: Import button.
  - Label: `Import N customers` when blocked === 0.
  - Label: `Fix N row${s} to continue` when blocked > 0, button disabled.
- Existing top-of-page Import button is removed to avoid duplication.

### 6. Import behavior
- On import, apply `rowEdits` overrides to each row before insert (already-validated `previewRows` already reflect edits via revalidate, so this is effectively a no-op read of `previewRows`).
- Blocked rows are excluded as today.

### Out of scope
- No new "warning" severity — `Needs check` chip stays at 0.
- No changes to parsing, mapping UI logic, or duplicate detection rules.
- No backend/RLS/schema changes.

### Deliverable
Full diff of `src/pages/ImportCustomers.tsx` after applying the above.
