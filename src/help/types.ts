export type HelpAudience = "engineer" | "office" | "admin" | "owner";

/** Crop of the SAME screenshot, in percent of the full image (0–100). Shown on phones only. */
export type HelpCrop = { x: number; y: number; width: number; height: number };

export type HelpScreenshot = {
  src: string;
  alt: string;
  device: "mobile" | "desktop";
  caption?: string;
  mobileCrop?: HelpCrop;
};

export type HelpCallout = { number?: number; label: string; text: string };

export type HelpNote = { tone: "info" | "warning"; text: string };

export type HelpStep = {
  slug: string;
  title: string;
  shortDescription: string;
  /** Short paragraphs or numbered instructions. */
  body: string[];
  instructions?: string[];
  callouts?: HelpCallout[];
  note?: HelpNote;
  notes?: HelpNote[];
  screenshots: HelpScreenshot[];
  keywords: string[];
};

export type HelpReference = {
  title: string;
  items?: string[];
  table?: { head: [string, string]; rows: [string, string][] };
};

export type HelpGuide = {
  slug: string;
  title: string;
  description: string;
  audience: HelpAudience[];
  lastUpdated: string; // DD/MM/YY
  keywords: string[];
  /** Approved training document this text was imported from. */
  sourceDocument?: string;
  intro?: string[];
  beforeYouStart?: string[];
  quickReference?: HelpReference[];
  steps: HelpStep[];
};

export type HelpComingSoon = { slug: string; title: string; description: string };
