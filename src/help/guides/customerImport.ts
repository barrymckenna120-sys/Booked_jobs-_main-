import type { HelpGuide } from "../types";
import s1 from "@/assets/help-import-data_import_screen_1.png.asset.json";
import s2 from "@/assets/help-import-data_import_screen_2.png.asset.json";
import s3 from "@/assets/help-import-data_scren_3.png.asset.json";
import s5 from "@/assets/help-import-data_import_5.png.asset.json";
import sRows from "@/assets/help-import-7_data.png.asset.json";
import sStatus from "@/assets/help-import-data_7.png.asset.json";
import sDup from "@/assets/help-import-data_import.png.asset.json";
import sExisting from "@/assets/help-import-data_6.png.asset.json";
import sConfirm from "@/assets/help-import-data_8.png.asset.json";

export const customerImportGuide: HelpGuide = {
  slug: "customer-import",
  title: "Import Customers",
  description: "Bring your customer list into BookedJobs from an Excel file, check it, then confirm.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  keywords: ["import", "excel", "xlsx", "upload", "customer list", "spreadsheet", "bulk"],
  steps: [
    {
      slug: "open-import",
      title: "Open Import Customers",
      shortDescription: "Find the import page in Settings.",
      body: ["Customer import lives in Settings, under Data & Security."],
      instructions: [
        "Open Settings.",
        "Tap Data & Security.",
        "Under Import Customers, tap Go to Import Page.",
      ],
      note: { tone: "info", text: "Export Customers is on the same screen if you need a copy of your list." },
      screenshots: [{ src: s1.url, device: "desktop", alt: "Settings, Data & Security section showing Import Customers and Export Customers cards" }],
      keywords: ["settings", "data & security", "go to import page"],
    },
    {
      slug: "upload-file",
      title: "Upload your Excel file",
      shortDescription: "Choose your .xlsx file and validate it.",
      body: [
        "Drag your Excel file onto the upload box, or tap it to browse. Only .xlsx files up to 5MB are accepted.",
        "Not sure of the layout? Tap Download Template (.xlsx). It has all the right columns and 4 example customers.",
      ],
      instructions: ["Add your file.", "Check the file name shown is the right one — tap Remove to change it.", "Tap Validate File."],
      note: { tone: "info", text: "Nothing is saved yet. Validating only checks the file." },
      screenshots: [
        { src: s2.url, device: "desktop", alt: "Import Customers page with upload box, template download and recent imports" },
        { src: s3.url, device: "desktop", alt: "Selected Excel file ready with the Validate File button" },
      ],
      keywords: ["upload", "template", "validate", "drag and drop", "recent imports"],
    },
    {
      slug: "check-columns",
      title: "Check the columns",
      shortDescription: "See how your file's columns were matched.",
      body: [
        "Columns found in your file lists every column heading. Recognised fields shows which BookedJobs field each one fills, for example Boiler Make → Boiler Brand.",
        "Optional fields that weren't matched are left blank.",
        "A summary line tells you how many rows are ready and how many have errors.",
      ],
      screenshots: [{ src: s5.url, device: "desktop", alt: "Columns found, recognised fields and the rows ready summary" }],
      keywords: ["columns", "fields", "mapping", "recognised"],
    },
    {
      slug: "fix-errors",
      title: "Fix rows with errors",
      shortDescription: "Red cells must be fixed; amber is a warning only.",
      body: ["You can edit any cell directly in the table."],
      callouts: [
        { label: "Red", text: "Required information is missing (e.g. Eircode). The row is marked Error and won't import until fixed." },
        { label: "Amber", text: "A warning, e.g. \"Doesn't look like a GPRN\". The row will still import." },
        { label: "Status", text: "Ready rows can import. \"Already exists\" means a matching customer is already in your list; \"New\" means they're not." },
      ],
      screenshots: [
        { src: sRows.url, device: "desktop", alt: "Import rows with one row highlighted red for a missing required Eircode" },
        { src: sStatus.url, device: "desktop", alt: "GPRN warnings in amber and the Ready, Error, Already exists and New status labels" },
      ],
      keywords: ["error", "required", "red", "warning", "gprn", "eircode", "fix"],
    },
    {
      slug: "duplicates-in-file",
      title: "Duplicates in your file",
      shortDescription: "Choose which copy of a repeated row to keep.",
      body: [
        "If the same customer appears more than once in your file, they're grouped under Duplicate rows in this file.",
        "The least complete row in each group is pre-selected for exclusion. Untick it to keep it, or tick another row to exclude that one instead.",
      ],
      screenshots: [
        { src: s5.url, device: "desktop", alt: "Duplicate review group showing the most complete row kept and the other excluded" },
        { src: sDup.url, device: "desktop", alt: "Rows flagged with duplicate phone in this file" },
      ],
      keywords: ["duplicate", "same phone", "exclude", "most complete"],
    },
    {
      slug: "existing-customers",
      title: "Customers already in your list",
      shortDescription: "Skip or merge each match.",
      body: ["Rows that match an existing customer are listed under Already in your customer list, with their jobs, quotes and payments on record."],
      callouts: [
        { label: "Skip (keep existing)", text: "The existing record stays exactly as it is." },
        { label: "Merge new details", text: "Fills in only the fields the existing record is missing. Nothing is overwritten." },
      ],
      screenshots: [{ src: sExisting.url, device: "desktop", alt: "Already in your customer list, with Skip and Merge new details buttons for each match" }],
      keywords: ["merge", "skip", "existing", "match", "already exists"],
    },
    {
      slug: "confirm-import",
      title: "Review and confirm",
      shortDescription: "Check the summary, then import.",
      body: [
        "Tap Review & Confirm Import. The summary shows new customers to create, customers to merge into, customers left unchanged, and duplicate rows excluded.",
        "Tap Confirm Import to save, or Back to review to make changes.",
      ],
      note: { tone: "info", text: "Every create, merge, skip and exclusion is recorded in the import history for your company." },
      screenshots: [{ src: sConfirm.url, device: "desktop", alt: "Confirm import summary with Back to review and Confirm Import buttons" }],
      keywords: ["confirm", "summary", "import history", "finish"],
    },
  ],
};
