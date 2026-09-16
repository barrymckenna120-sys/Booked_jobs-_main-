/**
 * BJ-0132 — booking intake de-duplication fingerprint.
 *
 * The sending automation can deliver the SAME customer booking twice,
 * milliseconds apart, each copy carrying a different Tally submission id. The
 * existing `tally_submission_id` idempotency guard cannot see those as one
 * booking, so a content fingerprint is used instead.
 *
 * This module is intentionally pure and mirrored byte-for-byte by
 * `supabase/functions/_shared/bookingIntakeClaim.ts` (Edge Functions cannot
 * import from `src/`). Keep the two in sync — the tests here are the contract.
 */

/** Default window in which two identical bookings are treated as one. */
export const BOOKING_CLAIM_WINDOW_MINUTES = 10;

export type BookingFingerprintParts = {
  /** Phone as supplied; normalised to E.164 by the caller before hashing. */
  phone: string;
  jobType: string;
  address: string;
  /** Requested date, `YYYY-MM-DD`, or null when the form omits it. */
  scheduledDate?: string | null;
  /** Requested time slot label, or null. */
  timeBlock?: string | null;
};

const normalisePart = (value: string | null | undefined): string =>
  (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Stable, order-independent input string for the fingerprint hash. Exported so
 * the hash can be reasoned about (and tested) without crypto.
 */
export function bookingFingerprintInput(parts: BookingFingerprintParts): string {
  return [
    normalisePart(parts.phone),
    normalisePart(parts.jobType),
    normalisePart(parts.address),
    normalisePart(parts.scheduledDate),
    normalisePart(parts.timeBlock),
  ].join("|");
}

/**
 * Returns true when there is enough content to identify a booking. Without a
 * phone number and an address two different bookings could collide, so the
 * guard must not run.
 */
export function canFingerprintBooking(parts: BookingFingerprintParts): boolean {
  return normalisePart(parts.phone) !== "" && normalisePart(parts.address) !== "";
}

/** SHA-256 hex of the fingerprint input. No personal data is stored. */
export async function buildBookingFingerprint(parts: BookingFingerprintParts): Promise<string> {
  const bytes = new TextEncoder().encode(bookingFingerprintInput(parts));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True when a previous claim is old enough to be ignored (outside the window). */
export function claimIsStale(
  claimCreatedAt: string,
  now: Date = new Date(),
  windowMinutes: number = BOOKING_CLAIM_WINDOW_MINUTES,
): boolean {
  const created = Date.parse(claimCreatedAt);
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > windowMinutes * 60_000;
}
