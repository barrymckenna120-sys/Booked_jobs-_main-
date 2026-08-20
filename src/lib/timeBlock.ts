/**
 * Shared time_block normaliser.
 *
 * Production data holds many spellings of the same slot (en dash vs hyphen,
 * stray spaces, word labels, legacy bare forms, plus NULLs and a few rows where
 * a UUID was written by mistake). These helpers give every consumer one
 * comparable sort value and one canonical display label.
 *
 * Standalone by design — not yet wired to any screen.
 */

/** Sorts unparseable / unscheduled rows last. */
export const UNKNOWN_TIME_BLOCK_MINUTES = 99999;

export const UNSCHEDULED_LABEL = "Unscheduled";

const WORD_STARTS: Record<string, number> = {
  morning: 8 * 60,
  midday: 11 * 60,
  midmorning: 11 * 60,
  noon: 12 * 60,
  afternoon: 14 * 60,
  evening: 18 * 60,
};

/** Business-hours rule for bare hours with no am/pm: 1–7 => pm, 8–12 => am. */
const inferMeridiem = (hour: number): number => (hour >= 1 && hour <= 7 ? hour + 12 : hour);

const DASH_RE = /[–—−-]/g;

type ParsedTime = { hour24: number; minute: number };

const parseTimeToken = (token: string, bare: boolean): ParsedTime | null => {
  const m = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.toLowerCase();
  if (hour > 24 || minute > 59) return null;
  if (suffix === "pm") hour = hour === 12 ? 12 : hour + 12;
  else if (suffix === "am") hour = hour === 12 ? 0 : hour;
  else if (bare) hour = inferMeridiem(hour);
  if (hour > 24) return null;
  return { hour24: hour, minute };
};

type ParsedBlock = { start: ParsedTime; end: ParsedTime | null };

const parseBlock = (raw: string | null | undefined): ParsedBlock | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const word = WORD_STARTS[trimmed.toLowerCase().replace(/[\s-]/g, "")];
  if (word !== undefined) {
    return { start: { hour24: Math.floor(word / 60), minute: word % 60 }, end: null };
  }

  // Reject UUIDs and anything else with no usable time token.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return null;

  const parts = trimmed
    .replace(DASH_RE, "-")
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const hasMeridiem = /am|pm/i.test(trimmed);
  const start = parseTimeToken(parts[0], !hasMeridiem);
  if (!start) return null;
  const end = parts.length > 1 ? parseTimeToken(parts[1], !hasMeridiem) : null;
  return { start, end };
};

/**
 * Minutes since midnight for the slot's start time.
 * NULL / empty / UUID / unparseable => UNKNOWN_TIME_BLOCK_MINUTES (sorts last).
 * Never throws.
 */
export const timeBlockStartMinutes = (raw: string | null | undefined): number => {
  const parsed = parseBlock(raw);
  if (!parsed) return UNKNOWN_TIME_BLOCK_MINUTES;
  return parsed.start.hour24 * 60 + parsed.start.minute;
};

const formatTime = ({ hour24, minute }: ParsedTime): string => {
  const suffix = hour24 >= 12 && hour24 < 24 ? "pm" : "am";
  const h12 = hour24 % 12 || 12;
  return minute ? `${h12}:${String(minute).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
};

/**
 * Canonical display label in one house style (en dash, no spaces).
 * e.g. "9am-11am" / "9am - 11am" / "Morning" => "8am–11am"-style output.
 * NULL / unparseable => UNSCHEDULED_LABEL.
 */
export const timeBlockLabel = (raw: string | null | undefined): string => {
  const parsed = parseBlock(raw);
  if (!parsed) return UNSCHEDULED_LABEL;
  const start = formatTime(parsed.start);
  if (!parsed.end) {
    // Word labels get their conventional slot windows.
    const endByStart: Record<number, string> = {
      [8 * 60]: "11am",
      [11 * 60]: "1pm",
      [14 * 60]: "5pm",
    };
    const end = endByStart[parsed.start.hour24 * 60 + parsed.start.minute];
    return end ? `${start}–${end}` : start;
  }
  return `${start}–${formatTime(parsed.end)}`;
};

/** Convenience comparator for sorting rows by their time_block. */
export const compareTimeBlocks = (a: string | null | undefined, b: string | null | undefined): number =>
  timeBlockStartMinutes(a) - timeBlockStartMinutes(b);
