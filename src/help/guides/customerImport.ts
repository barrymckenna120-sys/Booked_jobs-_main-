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

/** Text imported from the approved "BookedJobs Customer Import Guide" (Final PDF). */
export const customerImportGuide: HelpGuide = {
  slug: "customer-import",
  title: "Customer Import Guide",
  description: "A simple step-by-step reference for importing and updating customers from Excel.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  sourceDocument: "BookedJobs_Customer_Import_Guide_Final.pdf",
  keywords: ["import", "excel", "xlsx", "upload", "customer list", "spreadsheet", "bulk"],
  intro: [
    "Before a large import: download the BookedJobs template and test with 5-10 customers first. Review all red errors, duplicates and existing-customer matches before confirming.",
  ],
  beforeYouStart: [
    "Use the BookedJobs Excel template (.xlsx).",
    "Keep one customer per row.",
    "Do not change the template column headings.",
    "Remove test customers and obvious duplicates.",
    "Check phone numbers, addresses, Eircodes and service information.",
    "Do not guess missing information. Leave optional fields blank if the information is not known.",
  ],
  quickReference: [
    {
      title: "Quick pre-import checklist",
      items: [
        "Correct BookedJobs .xlsx template used",
        "One customer per row",
        "Customer names and phone numbers checked",
        "Addresses and Eircodes checked",
        "Duplicate rows reviewed",
        "Red errors fixed",
        "Orange warnings reviewed",
        "Existing customer matches reviewed",
        "Import summary checked before Confirm Import",
        "Imported customers checked after completion",
      ],
    },
    {
      title: "What the import results mean",
      table: {
        head: ["Result", "Meaning"],
        rows: [
          ["Imported successfully", "New customer records were created."],
          ["Updated", "Missing details were merged into existing customer records."],
          ["Skipped", "Existing customers were left unchanged."],
          ["Duplicate excluded", "A duplicate row in the uploaded Excel file was not imported."],
          ["Blocked", "The row has an error that must be fixed before import."],
        ],
      },
    },
  ],
  steps: [
    {
      slug: "open-import",
      title: "Open Customer Import",
      shortDescription: "Settings > Data & Security > Go to Import Page.",
      body: ["Go to Settings > Data & Security. Under Import Customers, click Go to Import Page."],
      screenshots: [{ src: s1.url, device: "desktop", alt: "Settings, Data & Security section showing Import Customers and Export Customers cards",
        mobileCrop: { x: 22, y: 0, width: 78, height: 47 } }],
      keywords: ["settings", "data & security", "go to import page"],
    },
    {
      slug: "download-template",
      title: "Download the BookedJobs template",
      shortDescription: "Use the template with the correct columns.",
      body: ["Click Download Template (.xlsx). Use this template because it contains the correct BookedJobs columns and example customer rows."],
      screenshots: [{ src: s2.url, device: "desktop", alt: "Import Customers page with upload box, Download Template (.xlsx) and recent imports" }],
      keywords: ["template", "download", "columns", "example"],
    },
    {
      slug: "upload-file",
      title: "Upload your Excel file",
      shortDescription: "Add the .xlsx file and click Validate File.",
      body: ["Drag the completed .xlsx file into the upload box, or click to browse. Check the filename, then click Validate File. Maximum file size is 5 MB."],
      screenshots: [{ src: s3.url, device: "desktop", alt: "Selected Excel file ready with the Validate File button" }],
      keywords: ["upload", "validate", "drag and drop", "5 mb"],
    },
    {
      slug: "check-columns",
      title: "Check recognised fields",
      shortDescription: "Check how your columns were matched.",
      body: ["BookedJobs reads the spreadsheet and matches recognised columns to customer fields. Check the mappings before continuing."],
      notes: [{ tone: "warning", text: "Important: Check that important spreadsheet columns have been recognised correctly." }],
      screenshots: [{ src: s5.url, device: "desktop", alt: "Columns found in your file and recognised fields",
        mobileCrop: { x: 20, y: 4, width: 76, height: 36 } }],
      keywords: ["columns", "fields", "mapping", "recognised"],
    },
    {
      slug: "fix-errors",
      title: "Fix blocked rows",
      shortDescription: "Red rows must be fixed before import.",
      body: ["Rows highlighted in red need attention. Correct required information directly on the import screen. A blocked row will not be imported until it is fixed."],
      notes: [{ tone: "warning", text: "Important: Do not continue while the screen shows a red 'blocked' warning." }],
      screenshots: [{ src: sRows.url, device: "desktop", alt: "Import rows with one row highlighted red for missing required information" }],
      keywords: ["error", "blocked", "required", "red", "fix"],
    },
    {
      slug: "duplicates-in-file",
      title: "Review duplicate rows",
      shortDescription: "Choose which copy of a repeated row is kept.",
      body: ["BookedJobs identifies duplicate rows in the uploaded file. Review which record is kept and which is excluded. The more complete record is normally pre-selected."],
      notes: [{ tone: "warning", text: "Important: A duplicate in the uploaded file is different from a customer who already exists in BookedJobs." }],
      screenshots: [
        { src: s5.url, device: "desktop", alt: "Duplicate review group showing the most complete row kept and the other excluded",
          mobileCrop: { x: 20, y: 49, width: 74, height: 39 } },
        { src: sDup.url, device: "desktop", alt: "Rows flagged with duplicate phone in this file" },
      ],
      keywords: ["duplicate", "same phone", "exclude", "most complete"],
    },
    {
      slug: "review-warnings",
      title: "Review warnings",
      shortDescription: "Orange means review; red means fix.",
      body: ["Orange warnings flag information that may be unusual, such as a duplicate phone number or a GPRN that does not look valid. Review these before importing."],
      notes: [{ tone: "warning", text: "Important: Orange is a warning to review. Red means the row needs fixing before it can be imported." }],
      screenshots: [{ src: sStatus.url, device: "desktop", alt: "GPRN warnings and the Ready and Error status labels" }],
      keywords: ["warning", "orange", "amber", "gprn", "duplicate phone"],
    },
    {
      slug: "existing-customers",
      title: "Review customers already in BookedJobs",
      shortDescription: "Skip (keep existing) or Merge new details.",
      body: ["For existing customers, choose Skip (keep existing) or Merge new details. Merge only fills fields that are missing from the existing customer record; it does not overwrite existing information."],
      notes: [{ tone: "warning", text: "Important: Use Merge new details only when you want to add missing information to the existing customer." }],
      screenshots: [{ src: sExisting.url, device: "desktop", alt: "Already in your customer list, with Skip (keep existing) and Merge new details buttons for each match",
        mobileCrop: { x: 14, y: 1, width: 82, height: 32 } }],
      keywords: ["merge", "skip", "existing", "match", "already exists"],
    },
    {
      slug: "confirm-import",
      title: "Review and confirm",
      shortDescription: "Check the summary, then Confirm Import.",
      body: ["Check the final summary: new customers, customers to merge, customers left unchanged, and duplicate rows excluded. When correct, click Confirm Import."],
      notes: [{ tone: "warning", text: "Important: Nothing is written to the customer list until the import is confirmed." }],
      screenshots: [{ src: sConfirm.url, device: "desktop", alt: "Confirm import summary with Back to review and Confirm Import buttons" }],
      keywords: ["confirm", "summary", "finish"],
    },
    {
      slug: "import-result",
      title: "Check the import result",
      shortDescription: "See what was imported, updated and skipped.",
      body: ["The completion screen shows how many customers were imported, updated and skipped. Click View Customers to check the records."],
      screenshots: [],
      keywords: ["result", "complete", "imported", "updated", "skipped", "view customers"],
    },
  ],
};
