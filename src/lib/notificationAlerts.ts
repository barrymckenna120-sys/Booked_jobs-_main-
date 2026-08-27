/**
 * Catch-up alerting for notifications that arrive while the app is not
 * actively subscribed (backgrounded PWA / suspended realtime socket).
 *
 * The realtime INSERT handler plays the sound for live events. When the socket
 * is asleep — the common case on iOS when the engineer submits a parts request
 * from the same device — the row is only seen by the next fetch, so the bell
 * badge updated but no sound ever played. These helpers decide which fetched
 * rows still deserve an audible alert, using a persisted high-water mark so a
 * plain page reload never replays old alerts.
 */

export interface AlertableNotification {
  id: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

export function alertMarkerKey(userId: string, surface?: string): string {
  return `notif_last_alerted_at:${surface ?? "all"}:${userId}`;
}

/** Newest created_at across the fetched rows, or the existing marker. */
export function nextAlertMarker<T extends { created_at: string }>(
  rows: T[],
  current: string | null,
): string | null {
  const newest = rows.reduce<string | null>(
    (max, r) => (max === null || r.created_at > max ? r.created_at : max),
    null,
  );
  if (!newest) return current;
  if (!current) return newest;
  return newest > current ? newest : current;
}

/**
 * Unread rows created strictly after the marker, newest first.
 * Returns [] when there is no marker yet (first load of a session/device):
 * the backlog at first sight is history, not a new event.
 */
export function selectCatchUpAlerts<T extends AlertableNotification>(
  rows: T[],
  marker: string | null,
): T[] {
  if (!marker) return [];
  return rows
    .filter((r) => !r.is_read && r.created_at > marker)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
