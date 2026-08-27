import { format, isToday, isYesterday, parseISO } from "date-fns";

/**
 * Single formatter for parts-request timestamps, shared by the office Parts list
 * and the engineer "My Parts" cards so the two screens can't drift apart again.
 *
 * The stored columns are full timestamptz values — the time was previously
 * dropped for anything older than yesterday (BJ-0066), which hid when a part was
 * actually ordered. Time is now always shown.
 */
export const formatPartTimestamp = (value: string | null | undefined): string => {
  if (!value) return "";
  try {
    const d = parseISO(value);
    if (Number.isNaN(d.getTime())) return "";
    const time = format(d, "h:mmaaa").toLowerCase();
    if (isToday(d)) return `Today, ${time}`;
    if (isYesterday(d)) return `Yesterday, ${time}`;
    return `${format(d, "d MMM yyyy")}, ${time}`;
  } catch {
    return "";
  }
};

/**
 * Labelled status timestamp for a parts request: the most advanced stage the row
 * has reached, so office sees "Ready 14 Aug 2026, 7:27am" rather than only the
 * date it was logged. Returns null for rows still sitting at Open.
 */
export const formatPartStatusStamp = (row: {
  ordered_at?: string | null;
  ready_at?: string | null;
  
  cancelled_at?: string | null;
}): { label: string; value: string } | null => {
  if (row.cancelled_at) {
    const value = formatPartTimestamp(row.cancelled_at);
    return value ? { label: "Cancelled", value } : null;
  }
  if (row.ready_at) {
    const value = formatPartTimestamp(row.ready_at);
    return value ? { label: "Ready", value } : null;
  }
  if (row.ordered_at) {
    const value = formatPartTimestamp(row.ordered_at);
    return value ? { label: "Ordered", value } : null;
  }
  return null;
};
