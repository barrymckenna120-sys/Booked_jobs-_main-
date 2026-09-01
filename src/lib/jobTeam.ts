/**
 * BJ-0090 — Jobs list "assigned team" display helpers.
 *
 * The lead engineer lives on `service_calls.assigned_engineer` / `_id`; assists
 * live in `job_engineers`. Labels here are purely job-role based (Lead /
 * Assistant), never the person's Team-settings role.
 */

export type JobAssistRow = {
  job_id: string;
  engineer_id: string;
  engineers?: { name: string | null } | null;
};

export type JobTeamLine = { key: string; name: string; role: "Lead" | "Assistant" };

/** Group raw job_engineers rows into a map of jobId -> assist names. */
export const groupJobAssists = (
  rows: JobAssistRow[] | null | undefined
): Record<string, { id: string; name: string }[]> => {
  const map: Record<string, { id: string; name: string }[]> = {};
  (rows || []).forEach((r) => {
    const name = r.engineers?.name?.trim();
    if (!r.job_id || !name) return;
    const list = (map[r.job_id] ||= []);
    if (!list.some((a) => a.id === r.engineer_id)) list.push({ id: r.engineer_id, name });
  });
  return map;
};

/**
 * Build the display lines for a job card. Returns an empty array when there is
 * no lead and no assists (caller renders "Unassigned").
 */
export const buildJobTeamLines = (
  leadName: string | null | undefined,
  assists: { id: string; name: string }[] | undefined
): JobTeamLine[] => {
  const lines: JobTeamLine[] = [];
  const lead = leadName?.trim();
  if (lead) lines.push({ key: "lead", name: lead, role: "Lead" });
  const seen = new Set<string>(lead ? [lead.toLowerCase()] : []);
  (assists || []).forEach((a) => {
    const key = a.name.trim().toLowerCase();
    if (!key || seen.has(key)) return; // never render the same person twice
    seen.add(key);
    lines.push({ key: a.id, name: a.name, role: "Assistant" });
  });
  return lines;
};
