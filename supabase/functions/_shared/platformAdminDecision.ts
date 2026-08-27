// Pure platform-admin decision logic (no Deno/npm imports) so it can be
// unit-tested from the app test runner. I/O lives in platformAdmin.ts.

export function parseOwnerAllowlist(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Pure decision: is this verified identity a platform admin? */
export function decidePlatformAdmin(
  identity: { email?: string | null; role?: string | null },
  ownerAllowlist: string[],
): { allowed: boolean; via?: "role" | "platform_owner_env" } {
  if ((identity.role ?? "") === "superadmin") return { allowed: true, via: "role" };
  const email = String(identity.email ?? "").trim().toLowerCase();
  if (email && ownerAllowlist.includes(email)) {
    return { allowed: true, via: "platform_owner_env" };
  }
  return { allowed: false };
}

