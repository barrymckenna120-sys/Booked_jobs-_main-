import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Sentry identity helpers — called once the signed-in user and their
 * organisation are known, so every subsequent event carries them.
 * All calls are fire-and-forget; failures here must never affect the app.
 */

const orgNameCache = new Map<string, string>();

export function setSentryUser(
  user: { id: string; email?: string | null } | null
): void {
  try {
    if (!user) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } catch {
    // Non-critical.
  }
}

export function setSentryOrgContext(orgId: string | null): void {
  if (!orgId) return;
  try {
    Sentry.setTag("org_id", orgId);

    const cachedName = orgNameCache.get(orgId);
    if (cachedName) {
      Sentry.setTag("org_name", cachedName);
      return;
    }

    supabase
      .from("organisations")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        const name = (data as { name?: string } | null)?.name;
        if (name) {
          orgNameCache.set(orgId, name);
          Sentry.setTag("org_name", name);
        }
      })
      .catch(() => {
        // Non-critical — org_id tag is already set.
      });
  } catch {
    // Non-critical.
  }
}
