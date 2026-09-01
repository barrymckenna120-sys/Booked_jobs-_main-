/**
 * BJ-0131 Phase 2 — the frontend duplicate matcher must stay a byte-for-byte
 * mirror of the module the Edge Functions import. If this fails, the browser
 * preview and the server commit could classify duplicates differently, which is
 * exactly the drift Phase 2 exists to remove.
 *
 * Run `node scripts/generate-import-duplicates.mjs` to regenerate the mirror.
 */
import { describe, it, expect } from "vitest";
// ?raw gives us the file text without executing it, so this is a pure content diff.
import canonical from "../../../supabase/functions/_shared/importDuplicates.ts?raw";
import mirror from "../importDuplicates.generated?raw";
import shim from "../importDuplicates?raw";

describe("import duplicate matcher mirror", () => {
  it("mirror body is identical to the canonical shared module", () => {
    // The mirror is the canonical file plus a generated banner.
    expect(mirror.endsWith(canonical)).toBe(true);
  });

  it("mirror is marked auto-generated so nobody edits it by hand", () => {
    expect(mirror).toContain("AUTO-GENERATED FILE — DO NOT EDIT");
    expect(mirror).toContain("@generated from supabase/functions/_shared/importDuplicates.ts");
  });

  it("the frontend entry point re-exports the canonical implementation", () => {
    expect(shim).toContain('export * from "./importDuplicates.generated"');
  });
});
