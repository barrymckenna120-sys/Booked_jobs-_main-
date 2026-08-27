/**
 * Idempotency guard for renewal reminder sends.
 *
 * BUG (Dublin Gas): send-renewal-reminder had NO dedup of any kind. Every
 * invocation built a message and hit the 360 Messenger API, so a double-tapped
 * "Send reminder" button (the UI did not disable while in flight), a retried
 * fetch, or two overlapping operators each produced a real WhatsApp message.
 * Observed in message_log: the same customer receiving 2-4 identical
 * renewal_reminder rows within the same second.
 *
 * The authoritative check is server-side: before sending, look for a recent
 * renewal_reminder row in message_log for this customer. Because the "pending"
 * log row is inserted BEFORE the outbound API call, a second invocation
 * arriving milliseconds later sees it and is suppressed.
 *
 * Deliberate re-sends (customer says "I never got it") stay possible: they are
 * either outside the cooldown window or pass force: true.
 */

/** Reminders sent inside this window are treated as the same reminder event. */
export const RENEWAL_REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 hours

/** Log statuses that mean "a message was already handed to the provider". */
const BLOCKING_STATUSES = new Set(["pending", "sent", "delivered", "read"]);

export interface RecentReminderRow {
  sent_at?: string | null;
  status?: string | null;
}

export interface DuplicateDecision {
  duplicate: boolean;
  reason: "duplicate_recent_reminder" | null;
  /** The blocking row's sent_at, for logging/telemetry. */
  lastSentAt: string | null;
}

/**
 * True when a prior reminder row means we must NOT send again right now.
 *
 * - `failed` rows never block — the customer got nothing, so a retry is valid.
 * - `force` bypasses the guard for explicit operator re-sends.
 */
export function isDuplicateRenewalSend(
  rows: RecentReminderRow[] | null | undefined,
  now: Date | number = new Date(),
  opts: { force?: boolean; cooldownMs?: number } = {},
): DuplicateDecision {
  const none: DuplicateDecision = { duplicate: false, reason: null, lastSentAt: null };
  if (opts.force) return none;
  if (!rows || rows.length === 0) return none;

  const nowMs = now instanceof Date ? now.getTime() : now;
  const cooldownMs = opts.cooldownMs ?? RENEWAL_REMINDER_COOLDOWN_MS;

  for (const row of rows) {
    const status = (row?.status ?? "pending").toLowerCase();
    if (!BLOCKING_STATUSES.has(status)) continue;

    if (!row?.sent_at) {
      // No timestamp but a blocking status — treat as an in-flight send.
      return { duplicate: true, reason: "duplicate_recent_reminder", lastSentAt: null };
    }

    const sentMs = new Date(row.sent_at).getTime();
    if (Number.isNaN(sentMs)) continue;

    const age = nowMs - sentMs;
    // Negative age = clock skew on a row logged "in the future"; still a dupe.
    if (age <= cooldownMs) {
      return { duplicate: true, reason: "duplicate_recent_reminder", lastSentAt: row.sent_at };
    }
  }

  return none;
}

/** ISO timestamp marking the start of the dedup lookup window. */
export function cooldownWindowStart(
  now: Date | number = new Date(),
  cooldownMs: number = RENEWAL_REMINDER_COOLDOWN_MS,
): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return new Date(nowMs - cooldownMs).toISOString();
}
