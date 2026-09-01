import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import { nextUserState } from "@/hooks/useAuth";

const makeUser = (id: string): User =>
  ({ id, email: `${id}@example.com`, aud: "authenticated" } as unknown as User);

describe("nextUserState (token-refresh identity churn)", () => {
  it("keeps the previous object when a token refresh returns the same user id", () => {
    const prev = makeUser("user-1");
    const refreshed = makeUser("user-1"); // new object, same identity
    expect(nextUserState(prev, refreshed)).toBe(prev);
  });

  it("publishes the new user when the id changes (account switch)", () => {
    const prev = makeUser("user-1");
    const next = makeUser("user-2");
    expect(nextUserState(prev, next)).toBe(next);
  });

  it("publishes null on sign-out", () => {
    expect(nextUserState(makeUser("user-1"), null)).toBeNull();
  });

  it("publishes the user on sign-in from signed-out", () => {
    const next = makeUser("user-1");
    expect(nextUserState(null, next)).toBe(next);
  });

  it("stays null while signed out", () => {
    expect(nextUserState(null, null)).toBeNull();
  });
});
