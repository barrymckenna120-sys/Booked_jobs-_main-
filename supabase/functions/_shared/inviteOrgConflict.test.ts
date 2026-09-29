import { assertEquals } from "jsr:@std/assert@1";
import { isCrossOrgInviteConflict } from "./inviteOrgConflict.ts";

Deno.test("existing login in another org is a conflict (regression: office invite landed on engineer screen)", () => {
  assertEquals(isCrossOrgInviteConflict("org-a", "org-b"), true);
});
Deno.test("same org re-invite is allowed", () => {
  assertEquals(isCrossOrgInviteConflict("org-a", "org-a"), false);
});
Deno.test("missing profile org is not a conflict", () => {
  assertEquals(isCrossOrgInviteConflict(null, "org-a"), false);
});
