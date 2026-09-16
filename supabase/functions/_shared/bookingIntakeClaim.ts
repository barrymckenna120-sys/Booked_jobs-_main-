/**
 * BJ-0132 — booking intake de-duplication (Edge Function side).
 *
 * Mirror of `src/lib/bookingIntakeClaim.ts` for the pure parts (Edge Functions
 * cannot import from `src/`), plus the atomic claim used by the Tally handlers.
 *
 * Why a claim table: the two copies of one booking arrive ~30ms apart, so a
 * read-then-insert check can lose the race. Each arrival first inserts a row
 * into `booking_intake_claims`, which has a unique index on
 * (organisation_id, fingerprint). The insert either succeeds (this arrival owns
 * the booking) or fails with 23505 (an identical booking is already being, or
 * has just been, processed).
 */

export const BOOKING_CLAIM_WINDOW_MINUTES = 10;

export type BookingFingerprintParts = {
  phone: string;
  jobType: string;
  address: string;
  scheduledDate?: string | null;
  timeBlock?: string | null;
};

const normalisePart = (value: string | null | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function bookingFingerprintInput(parts: BookingFingerprintParts): string {
  return [
    normalisePart(parts.phone),
    normalisePart(parts.jobType),
    normalisePart(parts.address),
    normalisePart(parts.scheduledDate),
    normalisePart(parts.timeBlock),
  ].join("|");
}

export function canFingerprintBooking(parts: BookingFingerprintParts): boolean {
  return normalisePart(parts.phone) !== "" && normalisePart(parts.address) !== "";
}

export async function buildBookingFingerprint(parts: BookingFingerprintParts): Promise<string> {
  const bytes = new TextEncoder().encode(bookingFingerprintInput(parts));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function claimIsStale(
  claimCreatedAt: string,
  now: Date = new Date(),
  windowMinutes: number = BOOKING_CLAIM_WINDOW_MINUTES,
): boolean {
  const created = Date.parse(claimCreatedAt);
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > windowMinutes * 60_000;
}

export type BookingClaim =
  /** This arrival owns the booking — carry on and create the job. */
  | { outcome: "claimed"; fingerprint: string; claimId: string }
  /** An identical booking arrived within the window. */
  | { outcome: "duplicate"; fingerprint: string; existingServiceCallId: string | null }
  /** Not enough content to fingerprint, or the guard itself failed — carry on. */
  | { outcome: "skipped"; reason: string };

/**
 * Atomically claim a booking fingerprint for an organisation.
 *
 * Advisory-safe: any unexpected failure returns `skipped` so a customer's
 * booking is never lost because the de-duplication guard misbehaved.
 */
export async function claimBookingIntake(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organisationId: string,
  parts: BookingFingerprintParts,
  logLabel = "booking-intake-claim",
  windowMinutes: number = BOOKING_CLAIM_WINDOW_MINUTES,
): Promise<BookingClaim> {
  if (!organisationId) return { outcome: "skipped", reason: "no_organisation" };
  if (!canFingerprintBooking(parts)) {
    return { outcome: "skipped", reason: "insufficient_content" };
  }

  let fingerprint: string;
  try {
    fingerprint = await buildBookingFingerprint(parts);
  } catch (_e) {
    return { outcome: "skipped", reason: "fingerprint_failed" };
  }

  try {
    // Release any claim older than the window so a genuine re-booking of the
    // same slot later on is never blocked.
    const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    await supabase
      .from("booking_intake_claims")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("fingerprint", fingerprint)
      .lt("created_at", cutoff);

    const { data: claim, error } = await supabase
      .from("booking_intake_claims")
      .insert({ organisation_id: organisationId, fingerprint })
      .select("id")
      .single();

    if (!error && claim) {
      return { outcome: "claimed", fingerprint, claimId: claim.id };
    }

    if ((error as { code?: string } | null)?.code === "23505") {
      const { data: existing } = await supabase
        .from("booking_intake_claims")
        .select("service_call_id, created_at")
        .eq("organisation_id", organisationId)
        .eq("fingerprint", fingerprint)
        .maybeSingle();
      return {
        outcome: "duplicate",
        fingerprint,
        existingServiceCallId: (existing as { service_call_id?: string } | null)?.service_call_id ?? null,
      };
    }

    console.error(`[${logLabel}] claim insert failed:`, (error as { message?: string } | null)?.message ?? error);
    return { outcome: "skipped", reason: "claim_insert_failed" };
  } catch (_e) {
    console.error(`[${logLabel}] claim threw:`, (_e as Error)?.message ?? _e);
    return { outcome: "skipped", reason: "claim_threw" };
  }
}

/** Records which job a claim produced, so the losing copy can point at it. */
export async function attachServiceCallToClaim(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  claimId: string,
  serviceCallId: string,
  logLabel = "booking-intake-claim",
): Promise<void> {
  try {
    const { error } = await supabase
      .from("booking_intake_claims")
      .update({ service_call_id: serviceCallId })
      .eq("id", claimId);
    if (error) {
      console.error(`[${logLabel}] claim update failed:`, error.message ?? error);
    }
  } catch (_e) {
    console.error(`[${logLabel}] claim update threw:`, (_e as Error)?.message ?? _e);
  }
}
