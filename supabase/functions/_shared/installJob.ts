// Pure helpers: install-job detection and Europe/Dublin date maths. No I/O.

export type InstallJobCandidate = { job_type?: string | null } | null | undefined;

const INSTALL_PATTERNS = ["install", "replace", "new boiler"];
const INSTALL_TAG = "new boiler fitted";

/** Install/replacement job, by job type or the "New Boiler Fitted" tag. */
export function isInstallJob(job: InstallJobCandidate, tagNames: Array<string | null | undefined> = []): boolean {
  const jt = String(job?.job_type ?? "").toLowerCase();
  if (INSTALL_PATTERNS.some((p) => jt.includes(p))) return true;
  return tagNames.some((t) => String(t ?? "").trim().toLowerCase() === INSTALL_TAG);
}

/** Calendar date (YYYY-MM-DD) of an instant in Europe/Dublin. */
export function dublinDate(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no timezone drift). */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Install date for a job: completed_at in Dublin, else paid_at, else null. */
export function installDateOf(job: { completed_at?: string | null; paid_at?: string | null }): string | null {
  const ts = job.completed_at || job.paid_at;
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : dublinDate(d);
}

/** Inclusive window check on YYYY-MM-DD strings: today-maxDays ≤ date ≤ today-minDays. */
export function inReminderWindow(date: unknown, today: string, minDays: number, maxDays: number): boolean {
  const s = String(date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return s >= addDays(today, -maxDays) && s <= addDays(today, -minDays);
}
