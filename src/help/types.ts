export type HelpAudience = "engineer" | "office" | "admin" | "owner";

export type HelpScreenshot = {
  src: string;
  alt: string;
  device: "mobile" | "desktop";
  caption?: string;
};

export type HelpCallout = { label: string; text: string };

export type HelpStep = {
  slug: string;
  title: string;
  shortDescription: string;
  /** Short paragraphs or numbered instructions. */
  body: string[];
  instructions?: string[];
  callouts?: HelpCallout[];
  note?: { tone: "info" | "warning"; text: string };
  screenshots: HelpScreenshot[];
  keywords: string[];
};

export type HelpGuide = {
  slug: string;
  title: string;
  description: string;
  audience: HelpAudience[];
  lastUpdated: string; // DD/MM/YY
  keywords: string[];
  steps: HelpStep[];
};

export type HelpComingSoon = { slug: string; title: string; description: string };
