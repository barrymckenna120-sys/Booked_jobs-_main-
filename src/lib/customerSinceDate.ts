/**
 * Builds the stored `customers.customer_since` value (YYYY-MM-DD) from the three
 * Day / Month / Year dropdowns on the Customer Profile.
 *
 * Previously a selection was discarded unless BOTH year and month were already
 * chosen, so picking a Day first (the natural first click on an empty field)
 * produced null — the dropdown snapped straight back to its placeholder and
 * nothing could be saved. Any single selection now yields a valid date:
 *  - missing year  -> current year
 *  - missing month -> January
 *  - missing day   -> 1st
 * The day is clamped to the length of the resolved month so 31 February can
 * never be stored.
 */
export function buildCustomerSinceDate(
  year: string,
  month: string,
  day: string,
  today: Date = new Date(),
): string | null {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);

  const yearNum = Number.isFinite(y) ? y : today.getFullYear();
  const monthNum = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1;
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const dayNum = Number.isFinite(d) && d >= 1 ? Math.min(d, daysInMonth) : 1;

  return `${String(yearNum).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}
