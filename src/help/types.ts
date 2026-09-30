export type HelpAudience = "engineer" | "office" | "admin" | "owner";

/** Crop of the SAME screenshot, in percent of the full image (0–100). Shown on phones only. */
export type HelpCrop = { x: number; y: number; width: number; height: number };

/** A numbered marker positioned as a percentage of the original screenshot. */
export type HelpScreenshotMarker = {
  number: number;
  x: number;
  y: number;
  label: string;
  text: string;
  /** Show the real BookedJobs control beside the explanation. */
  icon?: "engineer" | "office" | "bell" | "more";
};

/** One slice of a stitched screenshot. Sizes/crop in source-image pixels. */
export type HelpScreenshotSegment = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: { x: number; y: number; width: number; height: number };
};

export type HelpScreenshot = {
  src: string;
  alt: string;
  device: "mobile" | "desktop";
  caption?: string;
  mobileCrop?: HelpCrop;
  markers?: HelpScreenshotMarker[];
  /** Render these slices stacked seamlessly as one continuous screen (originals untouched). */
  segments?: HelpScreenshotSegment[];
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
