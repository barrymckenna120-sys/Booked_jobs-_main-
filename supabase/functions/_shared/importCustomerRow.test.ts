/**
 * BJ-0131 Phase 2 — parity + safety tests for the server-side import helpers.
 *
 * The point of these tests is that moving duplicate matching from the browser to
 * the Edge Functions changed no classifications. The matcher module itself is
 * byte-identical on both sides (see scripts/generate-import-duplicates.mjs), so
 * the cases below re-assert the classification contract against the shared copy
 * the Edge Functions actually import, and cover the server-only additions:
 * column allow-listing, insert defaults and outcome roll-up.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMergePayload,
  completenessScore,
  findInFileDuplicateGroups,
  matchExistingCustomers,
  normaliseGprnKey,
  normaliseNameAddressKey,
  normalisePhoneKey,
} from "./importDuplicates.ts";
import {
  ambiguousReason,
  buildInsertPayload,
  exclusionReason,
  hasRequiredFields,
  rejectedFields,
  sanitiseImportRow,
  summariseOutcomes,
} from "./importCustomerRow.ts";

// --- Matcher parity: same keys as the browser mirror -------------------------

Deno.test("normalisePhoneKey folds +353 / 00353 / leading 0 to one key", () => {
  const expected = "871234567";
  for (const input of ["087 123 4567", "+353 87 123 4567", "0035387 1234567", "353871234567"]) {
    assertEquals(normalisePhoneKey(input), expected, input);
  }
  assertEquals(normalisePhoneKey(""), "");
  assertEquals(normalisePhoneKey(null), "");
});

Deno.test("normalisePhoneKey is NOT the WhatsApp send normaliser", () => {
  // Documented on purpose: the send helper produces 353871234567 (dialling
  // format). The match key is the bare national number. Swapping them would
  // change matching, so they stay separate.
  assertEquals(normalisePhoneKey("+353871234567"), "871234567");
});

Deno.test("normaliseGprnKey keeps blanks blank so empty GPRNs never match", () => {
  assertEquals(normaliseGprnKey("  "), "");
  assertEquals(normaliseGprnKey("GPRN-123 456"), "123456");
});

Deno.test("normaliseNameAddressKey folds eircode separators and needs both parts", () => {
  assertEquals(
    normaliseNameAddressKey("John  O'Brien", "1 Main St.", "D01 X123"),
    normaliseNameAddressKey("john o brien", "1 main st", "d01x123"),
  );
  assertEquals(normaliseNameAddressKey("John", "", "D01X123"), "");
});

Deno.test("in-file grouping unions transitively and suggests the fuller row", () => {
  const groups = findInFileDuplicateGroups([
    { rowNum: 1, data: { name: "A", phone: "087 111 1111", address: "1 Main St", eircode: "D01X1" } },
    { rowNum: 2, data: { name: "A", phone: "+353871111111", address: "1 Main St", eircode: "D01X1", email: "a@x.ie" } },
    { rowNum: 3, data: { name: "B", phone: "087 222 2222", address: "2 Main St", eircode: "D02X2" } },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].rowNums, [1, 2]);
  assertEquals(groups[0].keepRowNum, 2);
  assertEquals(groups[0].suggestedExcludeRowNums, [1]);
  assertEquals(completenessScore({ name: "A" }) < completenessScore({ name: "A", email: "a@x.ie" }), true);
});

Deno.test("existing match prefers GPRN, then phone, then name+address", () => {
  const existing = [
    { id: "gprn-hit", name: "Z", address: "9 Other St", eircode: "D09", phone: "0879999999", gprn: "555000" },
    { id: "phone-hit", name: "Y", address: "8 Other St", eircode: "D08", phone: "0871234567", gprn: null },
  ];
  assertEquals(
    matchExistingCustomers({ gprn: "555 000", phone: "0871234567" }, existing).map((m) => [m.customer.id, m.reason]),
    [["gprn-hit", "gprn"]],
  );
  assertEquals(
    matchExistingCustomers({ phone: "+353 87 123 4567" }, existing).map((m) => [m.customer.id, m.reason]),
    [["phone-hit", "phone"]],
  );
  assertEquals(matchExistingCustomers({ phone: "0870000000" }, existing), []);
});

Deno.test("multiple customers on the winning key are all returned (ambiguous)", () => {
  const existing = [
    { id: "a", name: "A", address: "1 St", phone: "0871234567", gprn: null, eircode: "D01" },
    { id: "b", name: "B", address: "2 St", phone: "087 123 4567", gprn: null, eircode: "D02" },
  ];
  const matches = matchExistingCustomers({ phone: "0871234567" }, existing);
  assertEquals(matches.length, 2);
  assertEquals(ambiguousReason(matches.length), "Matches 2 existing customers — resolve the duplicates first");
});

Deno.test("merge never blanks a populated field", () => {
  assertEquals(
    buildMergePayload(
      { name: "New Name", email: "new@x.ie", notes: "   ", gprn: "123" },
      { name: "Existing", email: null, notes: "keep me", gprn: "" },
    ),
    { email: "new@x.ie", gprn: "123" },
  );
});

// --- Server-only hardening ---------------------------------------------------

Deno.test("sanitiseImportRow drops non-importable columns", () => {
  const raw = {
    name: "A",
    phone: "0871234567",
    address: "1 St",
    eircode: "D01",
    email: "",
    organisation_id: "other-org",
    is_test: true,
    id: "evil",
    user_id: "evil",
  };
  assertEquals(sanitiseImportRow(raw), {
    name: "A",
    phone: "0871234567",
    address: "1 St",
    eircode: "D01",
  });
  assertEquals(rejectedFields(raw).sort(), ["id", "is_test", "organisation_id", "user_id"]);
});

Deno.test("required fields survive even when blank, so validation still reports them", () => {
  assertEquals(sanitiseImportRow({ name: "", phone: "", address: "", eircode: "" }), {
    name: "",
    phone: "",
    address: "",
    eircode: "",
  });
  assertEquals(hasRequiredFields({ name: "A", phone: "1", address: "x", eircode: "D01" }), true);
  assertEquals(hasRequiredFields({ name: "A", phone: " ", address: "x", eircode: "D01" }), false);
});

Deno.test("insert defaults match the previous client-side insert", () => {
  const payload = buildInsertPayload(
    { name: "A", phone: "0871234567", address: "1 St", eircode: "D01" },
    { userId: "u1", orgId: "o1", now: new Date("2026-09-01T12:00:00Z") },
  );
  assertEquals(payload.organisation_id, "o1");
  assertEquals(payload.user_id, "u1");
  assertEquals(payload.boiler_type, "Gas");
  assertEquals(payload.owner_or_tenant, "Owner");
  assertEquals(payload.warranty_years, 10);
  assertEquals(payload.next_service_due, "2027-09-01");
  assertEquals(payload.renewal_stage, "none");
  assertEquals(payload.service_status, "active");
});

Deno.test("insert payload never carries a caller-supplied organisation", () => {
  const payload = buildInsertPayload(
    sanitiseImportRow({ name: "A", phone: "1", address: "x", eircode: "D01", organisation_id: "attacker-org" }),
    { userId: "u1", orgId: "trusted-org" },
  );
  assertEquals(payload.organisation_id, "trusted-org");
});

Deno.test("exclusion wording is preserved for one and many siblings", () => {
  assertEquals(exclusionReason(2, [1, 2]), "Excluded as a duplicate of row 1");
  assertEquals(exclusionReason(3, [1, 2, 3]), "Excluded as a duplicate of rows 1, 2");
  assertEquals(exclusionReason(4, []), "Excluded from this import by the operator");
});

Deno.test("outcome roll-up maps every outcome to the right counter", () => {
  assertEquals(
    summariseOutcomes([
      { row_number: 1, outcome: "created", customer_id: "a", error_message: null },
      { row_number: 2, outcome: "merged", customer_id: "b", error_message: null },
      { row_number: 3, outcome: "updated", customer_id: "c", error_message: null },
      { row_number: 4, outcome: "skipped_existing", customer_id: "d", error_message: null },
      { row_number: 5, outcome: "excluded_duplicate", customer_id: null, error_message: null },
      { row_number: 6, outcome: "skipped_ambiguous", customer_id: null, error_message: null },
      { row_number: 7, outcome: "failed", customer_id: null, error_message: "boom" },
    ]),
    { imported: 1, updated: 2, skipped: 2, skippedExisting: 1, excluded: 1 },
  );
});
