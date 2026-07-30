## Two corrections before building

**1. The migration isn't needed.** `customers.notes` already exists — confirmed by querying the live schema:

```
column_name: notes | data_type: text | is_nullable: YES
```

`ADD COLUMN IF NOT EXISTS` would be a no-op. Skipping it, since running a migration that changes nothing still puts an approval step in your way for no benefit. Say the word if you'd rather have it recorded anyway.

**2. Notes is already half-wired.** The alias map (`HEADER_TO_FIELD`, lines 48-49) already maps `"customer notes"` and `"notes"`, and the payload builder already writes `notes` (line 422). So the real work is the three gaps below, not a from-scratch field.

Also a naming note: `KNOWN_HEADERS` (line 86) is the *header-row detection* list, not the alias map — it's a 5-entry list used to sniff which spreadsheet row is the header. Adding Notes there would be wrong (it would let a stray "Notes" column make a data row look like a header). The aliases belong in `HEADER_TO_FIELD`.

## What changes

All in `src/pages/ImportCustomers.tsx`.

**1. Add the missing aliases** to `HEADER_TO_FIELD` alongside the existing two:

```
"note": "notes",
"comments": "notes",
"comment": "notes",
```

Header matching already lowercases and trims, so `Notes`, `Note`, `Comments`, `Comment` all resolve.

**2. Blank becomes null.** Currently `notes: field("notes")` yields `""` for a blank cell, so empty notes are stored as an empty string rather than null. Change to `field("notes") || null`, matching how `gprn` and `owner_or_tenant` already do it.

**3. Preview table column.** Add a `Notes` header after GPRN and a matching `EditableCell` cell with `fieldKey="notes"`. It'll use the same `hidden lg:table-cell` treatment as GPRN so the mobile preview stays readable.

## Explicitly untouched

- `REQUIRED_FIELDS` — Notes stays optional.
- `KNOWN_HEADERS` header-row detection.
- GPRN aliases, its 7-digit soft warning, and all boiler field logic.
- Every other validation rule, dedupe check, and default.

## Risk

Low. Notes is optional and free-text, with no validation and no downstream parsing. The one behaviour change beyond additions is blank-to-null, which affects only newly imported rows and aligns with existing fields. No tests — this is alias/markup wiring, not logic. I'll typecheck and click through the import preview after.
