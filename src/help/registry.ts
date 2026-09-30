import type { HelpComingSoon, HelpGuide, HelpStep } from "./types";
import { customerImportGuide } from "./guides/customerImport";

/** Published guides. Add a guide by adding a data file here — no new page code. */
export const HELP_GUIDES: HelpGuide[] = [customerImportGuide];

export const HELP_COMING_SOON: HelpComingSoon[] = [
  { slug: "engineer", title: "Engineer App", description: "Jobs, navigation, photos, fault finding, parts and payments" },
  { slug: "team-users", title: "Team & Users", description: "Add staff, manage engineers, availability and access" },
];

export const findGuide = (slug?: string) => HELP_GUIDES.find((g) => g.slug === slug) ?? null;

export const findStep = (guide: HelpGuide | null, stepSlug?: string) => {
  if (!guide) return null;
  const index = guide.steps.findIndex((s) => s.slug === stepSlug);
  return index < 0 ? null : { step: guide.steps[index], index };
};

export type HelpSearchResult = { guide: HelpGuide; step: HelpStep; score: number };

const tokens = (q: string) => q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

/** Every query word must appear somewhere in the step; titles/keywords rank higher. */
export const searchHelp = (query: string, guides: HelpGuide[] = HELP_GUIDES): HelpSearchResult[] => {
  const words = tokens(query);
  if (!words.length) return [];
  const out: HelpSearchResult[] = [];
  for (const guide of guides) {
    for (const step of guide.steps) {
      const title = step.title.toLowerCase();
      const keys = [...step.keywords, ...guide.keywords].join(" ").toLowerCase();
      const text = [step.shortDescription, ...step.body, ...(step.instructions ?? []),
        ...(step.callouts ?? []).map((c) => `${c.label} ${c.text}`)].join(" ").toLowerCase();
      let score = 0;
      let all = true;
      for (const w of words) {
        const s = (title.includes(w) ? 5 : 0) + (keys.includes(w) ? 3 : 0) + (text.includes(w) ? 1 : 0);
        if (!s) { all = false; break; }
        score += s;
      }
      if (all) out.push({ guide, step, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
};
