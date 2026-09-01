/**
 * Shared, de-duplicated read of the current user's `profiles` row.
 *
 * Step 3 of the Jobs-traffic plan: a single page load was issuing 7 identical
 * `profiles?select=role` requests (plus their CORS preflights) because the role
 * guard, the View-As provider, the superadmin route and the org resolver each
 * ran their own lookup. They now share one in-flight promise and a short-lived
 * result cache, so one load = one profile read.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CachedProfile {
  role: string | null;
  organisation_id: string | null;
}

/** Long enough to collapse a page load / route change, short enough to stay fresh. */
const TTL_MS = 60_000;

let cacheUserId: string | null = null;
let cacheValue: CachedProfile | null = null;
let cacheAt = 0;
let inFlight: Promise<CachedProfile> | null = null;

/** Drop the cache (sign-out, auth change, role edited in Team Management). */
export function clearProfileCache() {
  cacheUserId = null;
  cacheValue = null;
  cacheAt = 0;
  inFlight = null;
}

export async function fetchProfile(userId: string): Promise<CachedProfile> {
  if (cacheUserId !== userId) {
    clearProfileCache();
    cacheUserId = userId;
  }

  if (cacheValue && Date.now() - cacheAt < TTL_MS) return cacheValue;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("role, organisation_id")
        .eq("user_id", userId)
        .maybeSingle();

      const value: CachedProfile = {
        role: (data as any)?.role ?? null,
        organisation_id: (data as any)?.organisation_id ?? null,
      };
      cacheValue = value;
      cacheAt = Date.now();
      return value;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
