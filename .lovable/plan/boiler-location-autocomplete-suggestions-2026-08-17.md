# Boiler Location Autocomplete Suggestions

## Goal
Add a typing-aid autocomplete to the Boiler Location free-text field in the New Job wizard and the upcoming Customer Detail Boiler Information card, without adding any database columns, tables, or Settings entries.

## What will change

1. **Shared constant**
   - Create `src/lib/boilerLocations.ts` exporting:
     ```ts
     export const BOILER_LOCATIONS = [
       "Kitchen", "Attic", "Garage", "Utility Room",
       "Hot Press", "Airing Cupboard", "Under Stairs", "Hallway"
     ];
     ```

2. **NewJobPanel.tsx Step 2**
   - Import `BOILER_LOCATIONS`.
   - Wrap the existing Boiler Location `<Input>` with an HTML `<datalist id="boiler-location-list">` populated from the constant.
   - Add `list="boiler-location-list"` to the input.
   - Behaviour remains free-text: any value can still be typed and saved.

3. **CustomerDetail.tsx (BJ-0054 dependency)**
   - If BJ-0054 has shipped and Customer Detail has a Boiler Location field, apply the same `<datalist>` pattern using the same constant.
   - If BJ-0054 has not shipped, leave a code comment/note in the plan or in a TODO referencing `BOILER_LOCATIONS` so the autocomplete is wired when BJ-0054 lands.

## UI pattern choice
Use the native HTML `<datalist>` element. It is already a browser-native autocomplete pattern, requires no new component, keeps the field free-text, and avoids introducing a new combobox dependency. No existing project component uses datalist for this exact pattern; the custom Command-based combobox in `QuoteForm.tsx` is overkill for a simple suggestion list and would force a select-like interaction rather than free text.

## Out of scope
- No database migration.
- No Settings tab or org-level config.
- No validation or required constraint.
- No changes to save/persistence logic beyond wiring the existing input.

## Verification
- Open New Job wizard Step 2, focus Boiler Location, confirm browser shows the suggestion list.
- Type a value not in the list and confirm it still saves normally.
- Confirm Customer Detail field (once BJ-0054 ships) uses the same list.
