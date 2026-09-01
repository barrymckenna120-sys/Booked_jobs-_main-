import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { generateImportTemplate } from "@/lib/generateTemplate";
import { isValidGprnFormat, GPRN_WARNING_MESSAGE } from "@/lib/validation/gprn";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Info, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import ImportRunHistory from "@/components/import/ImportRunHistory";
import type { ImportRunRowDetail } from "@/components/import/importRunTypes";
import DuplicateReviewPanel, {
  type ExistingHistory,
  type ExistingMatchRow,
} from "@/components/import/DuplicateReviewPanel";
import {
  findInFileDuplicateGroups,
  matchExistingCustomers,
  buildMergePayload,
  normaliseGprnKey,
  normalisePhoneKey,
  type ExistingCustomerLite,
  type ExistingMatchResult,
} from "@/lib/importDuplicates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/** Normalise a header cell for alias comparison: trim, collapse internal
 *  whitespace runs to a single space, lower-case. */
const normalizeHeader = (val: any): string =>
  String(val ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Map recognisable Excel header names (normalised) → internal field */
const HEADER_TO_FIELD: Record<string, string> = {
  "customer name": "name",
  "name": "name",
  "mobile number": "phone",
  "phone number": "phone",
  "phone": "phone",
  "email": "email",
  "address": "address",
  "eircode": "eircode",
  "gprn": "gprn",
  "gprn no": "gprn",
  "gprn number": "gprn",
  "gas point reference number": "gprn",
  "access notes": "access_notes",
  "boiler brand": "boiler_brand",
  "boiler make": "boiler_brand",
  "boiler model": "boiler_model",
  "boiler type": "boiler_type",
  "installation date": "boiler_installation_date",
  "under warranty": "under_warranty",
  "warranty years": "warranty_years",
  "warranty": "warranty_years",
  "owner or tenant": "owner_or_tenant",
  "owner/tenant": "owner_or_tenant",
  "last service date": "last_service_date",
  "last service engineer": "last_service_engineer",
  "engineer notes": "engineer_notes",
  "next service due": "next_service_due",
  "service status": "service_status",
  "assigned engineer": "assigned_engineer",
  "customer notes": "notes",
  "notes": "engineer_notes",
  "note": "engineer_notes",
  "comments": "engineer_notes",
  "comment": "engineer_notes",
  "customer since": "customer_since",
};

/** Friendly display label for each internal field (used in mapping UI + error messages) */
const FIELD_LABEL: Record<string, string> = {
  name: "Customer Name",
  phone: "Phone Number",
  email: "Email",
  address: "Address",
  eircode: "Eircode",
  gprn: "GPRN",
  access_notes: "Access Notes",
  boiler_brand: "Boiler Brand",
  boiler_model: "Boiler Model",
  boiler_type: "Boiler Type",
  boiler_installation_date: "Installation Date",
  under_warranty: "Under Warranty",
  warranty_years: "Warranty Years",
  owner_or_tenant: "Owner or Tenant",
  last_service_date: "Last Service Date",
  last_service_engineer: "Last Service Engineer",
  engineer_notes: "Engineer Notes",
  next_service_due: "Next Service Due",
  service_status: "Service Status",
  assigned_engineer: "Assigned Engineer",
  notes: "Customer Notes",
  customer_since: "Customer Since",
};

const REQUIRED_FIELDS = ["name", "phone", "address", "eircode"] as const;
const ALL_FIELDS = Array.from(new Set(Object.values(HEADER_TO_FIELD)));
const OPTIONAL_FIELDS = ALL_FIELDS.filter((f) => !REQUIRED_FIELDS.includes(f as any));
const PAGE_SIZE = 10;

/** Headers we look for to identify the header row */
const KNOWN_HEADERS = ["customer name", "name", "mobile number", "phone number", "phone", "address", "eircode"];

/** Scan the first N rows to find the header row index and build a column map */
function detectHeaderRow(
  allRows: any[][]
): { headerIdx: number; colMap: Record<string, number>; rawHeaders: string[] } | null {
  const scanLimit = Math.min(10, allRows.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = allRows[i];
    if (!row || row.length < 3) continue;
    const lowered = row.map((c: any) => normalizeHeader(c));
    const matchCount = KNOWN_HEADERS.filter((h) => lowered.includes(h)).length;
    if (matchCount >= 3) {
      const colMap: Record<string, number> = {};
      for (let col = 0; col < lowered.length; col++) {
        const field = HEADER_TO_FIELD[lowered[col]];
        if (field && !(field in colMap)) colMap[field] = col;
      }
      const rawHeaders = row.map((c: any) => String(c ?? "").trim());
      return { headerIdx: i, colMap, rawHeaders };
    }
  }
  return null;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    const dd = String(val.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const str = String(val).trim();
  const irish = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (irish) return `${irish[3]}-${irish[2].padStart(2, "0")}-${irish[1].padStart(2, "0")}`;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Validate and normalize Irish mobile number to +353 international format */
function validateImportPhone(val: any): { valid: boolean; normalized: string | null; error?: string } {
  if (!val) return { valid: false, normalized: null, error: "Phone Number is required" };
  let str = String(val).trim().replace(/\s/g, "");
  if (str.startsWith("+")) str = str.slice(1);
  if (str.startsWith("353")) str = str.slice(3);
  if (str.startsWith("0")) str = str.slice(1);
  if (!/^\d{7,9}$/.test(str)) {
    return { valid: false, normalized: null, error: "Invalid phone number format" };
  }
  return { valid: true, normalized: `+353${str}` };
}

function cellStr(row: any[], idx: number): string {
  const v = row[idx];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

type FieldErrors = Record<string, string>;

type ParsedRow = {
  rowNum: number;
  srcIndex: number;
  data: Record<string, any>;
  errors: string[];
  fieldErrors: FieldErrors;
  /** Non-blocking, informational per-field notes (row still imports). */
  fieldWarnings: FieldErrors;
  isValid: boolean;
};

const ImportCustomers = () => {
  const { user, loading: authLoading } = useAuth();
  const { orgId } = useOrgId();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validated, setValidated] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    skippedExisting: number;
    excluded: number;
    failedRows: { name: string; reason: string }[];
  } | null>(null);

  // Column mapping state
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [autoColMap, setAutoColMap] = useState<Record<string, number>>({});
  const [manualMap, setManualMap] = useState<Record<string, number>>({});
  const [headerIdx, setHeaderIdx] = useState<number>(0);
  const [dataRows, setDataRows] = useState<any[][]>([]);

  // Session-only overrides keyed by srcIndex (index into dataRows), then by field key.
  const [rowEdits, setRowEdits] = useState<Record<number, Record<string, string>>>({});
  const [page, setPage] = useState(1);

  // Row-level selection. Until the operator touches a checkbox, every ready row is
  // treated as selected (selectionDirty === false), so the default is "import all ready".
  const [selectedRowNums, setSelectedRowNums] = useState<Set<number>>(new Set());
  const [selectionDirty, setSelectionDirty] = useState(false);

  // Existing customers for this organisation that could match a row in this file.
  // Fetched once per file, always scoped to organisation_id, then matched locally on
  // GPRN / phone / name+address. `null` means "lookup not resolved yet".
  const [existingCandidates, setExistingCandidates] = useState<ExistingCustomerLite[] | null>(null);
  // Full existing rows keyed by id, used to compute merge payloads.
  const [existingById, setExistingById] = useState<Map<string, Record<string, any>>>(new Map());
  // Linked history counts per existing customer id.
  const [historyCounts, setHistoryCounts] = useState<Map<string, ExistingHistory>>(new Map());

  // Duplicate-review decisions. `excluded` holds spreadsheet rows the operator (or the
  // pre-selection) drops; `decisions` holds Skip/Merge per row matching an existing customer.
  const [excludedRowNums, setExcludedRowNums] = useState<Set<number>>(new Set());
  const [excludeDirty, setExcludeDirty] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, "skip" | "merge">>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const effectiveColMap = useMemo(
    () => ({ ...autoColMap, ...manualMap }),
    [autoColMap, manualMap]
  );

  const missingRequired = useMemo(
    () => REQUIRED_FIELDS.filter((f) => !(f in effectiveColMap)),
    [effectiveColMap]
  );
  const missingOptional = useMemo(
    () => OPTIONAL_FIELDS.filter((f) => !(f in effectiveColMap)),
    [effectiveColMap]
  );

  const resetMapping = () => {
    setRawHeaders([]);
    setAutoColMap({});
    setManualMap({});
    setHeaderIdx(0);
    setDataRows([]);
    setRowEdits({});
    setPage(1);
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".xlsx")) {
      toast({ title: "Invalid format", description: "Only .xlsx files are accepted.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 5MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setParsedRows([]);
    setValidated(false);
    setImportResult(null);
    resetMapping();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const clearFile = () => {
    setFile(null);
    setParsedRows([]);
    setValidated(false);
    setImportResult(null);
    resetMapping();
  };

  /** Step 1: read file, detect header, cache raw headers + data rows. No row validation yet. */
  const readFile = async () => {
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("customer")) || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const detected = detectHeaderRow(allRows);
    if (!detected) {
      toast({
        title: "Header row not found",
        description:
          "Could not find a row with recognisable column headers (Customer Name, Address, Eircode, etc).",
        variant: "destructive",
      });
      return;
    }
    setRawHeaders(detected.rawHeaders);
    setAutoColMap(detected.colMap);
    setManualMap({});
    setHeaderIdx(detected.headerIdx);
    setDataRows(allRows.slice(detected.headerIdx + 1));
    setRowEdits({});
    setPage(1);
    setValidated(true);
  };

  /** Build a single ParsedRow from a raw row + column map + optional per-field overrides. */
  const buildRow = useCallback(
    (
      row: any[],
      srcIndex: number,
      colMap: Record<string, number>,
      overrides: Record<string, string> | undefined,
      hdrIdx: number
    ): ParsedRow | null => {
      const hasCol = (key: string) => key in colMap;

      // rawField returns the raw cell value (may be Date, number, string) unless overridden.
      const rawField = (key: string): any => {
        if (overrides && overrides[key] !== undefined) return overrides[key];
        const idx = colMap[key];
        if (idx === undefined) return undefined;
        return row[idx];
      };
      // field returns trimmed string, honouring overrides.
      const field = (key: string): string => {
        if (overrides && overrides[key] !== undefined) return String(overrides[key] ?? "").trim();
        const idx = colMap[key];
        return idx !== undefined ? cellStr(row, idx) : "";
      };

      const name = field("name");
      const phone = field("phone");
      const address = field("address");

      const hasAnyOverride = overrides && Object.keys(overrides).length > 0;
      // Skip only when the original row is empty AND user hasn't started editing it.
      if (!name && !phone && !address && !hasAnyOverride) return null;

      const errors: string[] = [];
      const fieldErrors: FieldErrors = {};
      const fieldWarnings: FieldErrors = {};

      const eircode = field("eircode");
      const boilerType = field("boiler_type");
      const underWarranty = field("under_warranty");
      const serviceStatus = field("service_status");

      // GPRN is optional. If present but not a plausible reference (roughly 7 digits,
      // purely numeric), warn on the cell without blocking the row.
      const gprn = field("gprn");
      if (gprn && !isValidGprnFormat(gprn.replace(/\s/g, ""))) {
        fieldWarnings.gprn = GPRN_WARNING_MESSAGE.replace("save", "import");
      }

      if (hasCol("name") && !name) {
        const msg = "Customer Name is missing for this row";
        errors.push(msg);
        fieldErrors.name = "Required";
      }

      if (hasCol("phone")) {
        if (!phone) {
          errors.push("Phone is missing for this row");
          fieldErrors.phone = "Required";
        } else {
          const phoneValidation = validateImportPhone(phone);
          if (!phoneValidation.valid) {
            errors.push(`Phone '${phone}' isn't a valid format`);
            fieldErrors.phone = "Invalid phone format";
          }
        }
      }

      if (hasCol("address") && !address) {
        errors.push("Address is missing for this row");
        fieldErrors.address = "Required";
      }
      if (hasCol("eircode") && !eircode) {
        errors.push("Eircode is missing for this row");
        fieldErrors.eircode = "Required";
      }

      if (boilerType && !["Gas", "Oil"].includes(boilerType)) {
        errors.push(`Boiler Type '${boilerType}' must be Gas or Oil`);
        fieldErrors.boiler_type = "Must be Gas or Oil";
      }
      if (underWarranty && !["Yes", "No"].includes(underWarranty)) {
        errors.push(`Under Warranty '${underWarranty}' must be Yes or No`);
        fieldErrors.under_warranty = "Must be Yes or No";
      }
      if (serviceStatus && !["Overdue", "Due Soon", "Up to Date"].includes(serviceStatus)) {
        errors.push(`Status '${serviceStatus}' must be: Overdue, Due Soon, or Up to Date`);
        fieldErrors.service_status = "Must be Overdue, Due Soon, or Up to Date";
      }

      const dateFieldKeys = [
        { key: "boiler_installation_date", label: "Installation Date" },
        { key: "last_service_date", label: "Last Service Date" },
        { key: "next_service_due", label: "Next Service Due" },
        { key: "customer_since", label: "Customer Since" },
      ];
      for (const df of dateFieldKeys) {
        const rawVal = rawField(df.key);
        if (!rawVal) continue;
        if (rawVal instanceof Date) continue;
        if (!parseDate(rawVal)) {
          errors.push(
            `${df.label} '${String(rawVal)}' isn't a valid date (DD/MM/YYYY, YYYY-MM-DD, or Excel datetime)`
          );
          fieldErrors[df.key] = "Invalid date";
        }
      }

      const normalisedPhone = hasCol("phone")
        ? (validateImportPhone(phone).normalized || phone)
        : "";

      return {
        rowNum: hdrIdx + 2 + srcIndex,
        srcIndex,
        data: {
          name,
          phone: normalisedPhone,
          email: field("email"),
          address,
          eircode,
          gprn: gprn || null,
          access_notes: field("access_notes"),
          boiler_brand: field("boiler_brand"),
          boiler_model: field("boiler_model"),
          boiler_make_model:
            [field("boiler_brand"), field("boiler_model")]
              .filter(Boolean)
              .join(" ") || null,
          boiler_type: boilerType || null,
          boiler_installation_date: parseDate(rawField("boiler_installation_date")),
          under_warranty: underWarranty === "Yes" ? true : underWarranty === "No" ? false : null,
          warranty_years: (() => {
            const raw = field("warranty_years");
            if (!raw) return null;
            const n = parseInt(raw, 10);
            return Number.isFinite(n) ? n : null;
          })(),
          owner_or_tenant: field("owner_or_tenant") || null,
          last_service_date: parseDate(rawField("last_service_date")),
          last_service_engineer: field("last_service_engineer"),
          engineer_notes: field("engineer_notes"),
          next_service_due: parseDate(rawField("next_service_due")),
          service_status: serviceStatus || "Up to Date",
          assigned_engineer: field("assigned_engineer"),
          notes: field("notes") || null,
          customer_since: parseDate(rawField("customer_since")),
        },
        errors,
        fieldErrors,
        fieldWarnings,
        isValid: errors.length === 0,
      };
    },
    []
  );

  /** Step 2: pure function of dataRows + effective colMap + rowEdits. Re-runs on remap. */
  const runRowValidation = useCallback(() => {
    if (!validated || dataRows.length === 0) {
      setParsedRows([]);
      return;
    }
    const results: ParsedRow[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const built = buildRow(dataRows[i], i, effectiveColMap, rowEdits[i], headerIdx);
      if (!built) break; // stop at first empty row (same behaviour as before)
      results.push(built);
    }
    setParsedRows(results);
  }, [validated, dataRows, effectiveColMap, headerIdx, rowEdits, buildRow]);

  // Full re-validate whenever mapping/data changes. rowEdits are handled per-row below,
  // but we include them so remaps still see current edits.
  useEffect(() => {
    runRowValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validated, dataRows, effectiveColMap, headerIdx]);

  // Reset page and row selection whenever mapping or data changes: rows are
  // re-validated, so a stale selection would point at the wrong rows.
  useEffect(() => {
    setPage(1);
    setSelectedRowNums(new Set());
    setSelectionDirty(false);
  }, [dataRows, effectiveColMap]);

  /** Re-validate a single row in place after an edit. */
  const revalidateRow = useCallback(
    (srcIndex: number, nextEdits: Record<string, string>) => {
      const row = dataRows[srcIndex];
      if (!row) return;
      const built = buildRow(row, srcIndex, effectiveColMap, nextEdits, headerIdx);
      if (!built) return;
      setParsedRows((prev) => {
        const idx = prev.findIndex((r) => r.srcIndex === srcIndex);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = built;
        return next;
      });
    },
    [dataRows, effectiveColMap, headerIdx, buildRow]
  );

  const updateEdit = (srcIndex: number, fieldKey: string, value: string) => {
    setRowEdits((prev) => {
      const rowMap = { ...(prev[srcIndex] || {}) };
      rowMap[fieldKey] = value;
      const next = { ...prev, [srcIndex]: rowMap };
      // Re-validate on next tick so state has settled.
      queueMicrotask(() => revalidateRow(srcIndex, rowMap));
      return next;
    });
  };

  const cleanData = (raw: Record<string, any>): Record<string, any> => {
    const required = ["name", "phone", "address", "eircode"];
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (required.includes(key)) {
        cleaned[key] = value;
      } else if (value !== null && value !== undefined && value !== "") {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const handleImport = async () => {
    if (!user) return;
    if (missingRequired.length > 0) return;
    setConfirmOpen(false);
    // Partition rather than filter: ambiguous rows and rows excluded as duplicates are
    // never committed, but they must still be logged instead of vanishing from the audit
    // trail. Ready rows are additionally narrowed to the operator's checkbox selection —
    // deselected rows are neither written nor logged.
    const selectedReady = decoratedRows.filter((r) => r.isValid && selectedSet.has(r.rowNum));
    const excludedRows = selectedReady.filter((r) => excludedRowNums.has(r.rowNum));
    const validRows = selectedReady.filter((r) => !excludedRowNums.has(r.rowNum));
    const ambiguousRows = decoratedRows.filter((r) => ambiguousRowNums.has(r.rowNum));
    if (validRows.length === 0 && ambiguousRows.length === 0 && excludedRows.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let skippedExisting = 0;
    let excluded = 0;
    const failedRows: { name: string; reason: string }[] = [];
    // Audit trail for this commit — appended wherever a counter is incremented.
    const rowDetails: ImportRunRowDetail[] = [];

    // Logged up front: these rows never enter the commit loop, so no customer
    // write can result from them.
    for (const row of ambiguousRows) {
      const count = existingCandidates
        ? matchExistingCustomers(row.data, existingCandidates).length
        : 0;
      const reason = `Matches ${count} existing customers — resolve the duplicates first`;
      skipped++;
      failedRows.push({ name: row.data.name || `Row ${row.rowNum}`, reason });
      rowDetails.push({
        row_number: row.rowNum,
        outcome: "skipped_ambiguous",
        customer_id: null,
        error_message: reason,
      });
    }

    // Duplicate rows the operator chose to drop. Logged, never written.
    for (const row of excludedRows) {
      const group = dupGroups.find((g) => g.rowNums.includes(row.rowNum));
      const reason = group
        ? `Excluded as a duplicate of row${group.rowNums.filter((n) => n !== row.rowNum).length === 1 ? "" : "s"} ${group.rowNums
            .filter((n) => n !== row.rowNum)
            .join(", ")}`
        : "Excluded from this import by the operator";
      excluded++;
      rowDetails.push({
        row_number: row.rowNum,
        outcome: "excluded_duplicate",
        customer_id: null,
        error_message: reason,
      });
    }


    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const advance = () =>
        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      try {
        const cleaned = cleanData(row.data);

        // The reviewed match set the operator saw in the preview. Committing follows
        // that review, so what gets written is exactly what was confirmed.
        const reviewed = existingCandidates
          ? matchExistingCustomers(row.data, existingCandidates)
          : [];

        if (reviewed.length > 1) {
          skipped++;
          const reason = `Matches ${reviewed.length} existing customers — resolve the duplicates first`;
          failedRows.push({ name: row.data.name || `Row ${row.rowNum}`, reason });
          rowDetails.push({
            row_number: row.rowNum,
            outcome: "skipped_ambiguous",
            customer_id: null,
            error_message: reason,
          });
          advance();
          continue;
        }

        if (reviewed.length === 1) {
          const targetId = reviewed[0].customer.id;
          const decision = decisions[row.rowNum] ?? "skip";

          if (decision === "skip") {
            skippedExisting++;
            rowDetails.push({
              row_number: row.rowNum,
              outcome: "skipped_existing",
              customer_id: targetId,
              error_message: "Existing customer kept unchanged (Skip)",
            });
            advance();
            continue;
          }

          const mergePayload = buildMergePayload(cleaned, existingById.get(targetId) || {});
          if (Object.keys(mergePayload).length === 0) {
            skippedExisting++;
            rowDetails.push({
              row_number: row.rowNum,
              outcome: "skipped_existing",
              customer_id: targetId,
              error_message: "Nothing new to merge — existing record already complete",
            });
            advance();
            continue;
          }

          const { error } = await supabase
            .from("customers")
            .update(mergePayload)
            .eq("id", targetId)
            .eq("organisation_id", orgId!);
          if (error) throw error;
          updated++;
          rowDetails.push({
            row_number: row.rowNum,
            outcome: "merged",
            customer_id: targetId,
            error_message: `Merged fields: ${Object.keys(mergePayload).join(", ")}`,
          });
          advance();
          continue;
        }

        // No reviewed match — re-check by phone immediately before inserting so a
        // customer created since the preview can't be duplicated by this run.
        const { data: existingRows, error: lookupError } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", cleaned.phone)
          .eq("organisation_id", orgId);
        if (lookupError) throw lookupError;

        if ((existingRows?.length || 0) > 0) {
          skippedExisting++;
          const reason =
            "A customer with this phone was created after the preview — review and re-import";
          failedRows.push({ name: row.data.name || `Row ${row.rowNum}`, reason });
          rowDetails.push({
            row_number: row.rowNum,
            outcome: "skipped_existing",
            customer_id: existingRows![0].id,
            error_message: reason,
          });
          advance();
          continue;
        }

        const nextServiceDue = new Date();
        nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
        const { data: insertedRows, error } = await supabase
          .from("customers")
          .insert([{
            ...cleaned,
            user_id: user.id,
            organisation_id: orgId!,
            boiler_type: cleaned.boiler_type || "Gas",
            owner_or_tenant: cleaned.owner_or_tenant || "Owner",
            warranty_years: cleaned.warranty_years ?? 10,
            next_service_due: cleaned.next_service_due || nextServiceDue.toISOString().split("T")[0],
            renewal_stage: cleaned.renewal_stage || "none",
            service_status: cleaned.service_status || "active",
          } as any])
          .select("id");
        if (error) throw error;
        imported++;
        rowDetails.push({
          row_number: row.rowNum,
          outcome: "created",
          customer_id: insertedRows?.[0]?.id ?? null,
          error_message: null,
        });

      } catch (err: any) {
        skipped++;
        const reason = err.message || "Unknown error";
        failedRows.push({
          name: row.data.name || `Row ${row.rowNum}`,
          reason,
        });
        rowDetails.push({
          row_number: row.rowNum,
          outcome: "failed",
          customer_id: null,
          error_message: reason,
        });
      }

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    // Audit log — written once, after every customer write. Purely additive: a
    // failure here is surfaced but never affects the import that already happened.
    if (orgId) {
      const { data: runRow, error: logError } = await supabase
        .from("import_runs")
        .insert({
          organisation_id: orgId,
          filename: file?.name || "unknown.xlsx",
          imported_by: user.id,
          total_rows: validRows.length + ambiguousRows.length + excludedRows.length,
          created_count: imported,
          updated_count: updated,
          error_count: skipped,
          row_details: rowDetails as any,
        })
        .select("id")
        .maybeSingle();
      if (logError) {
        toast({
          title: "Import saved, audit log failed",
          description: logError.message,
          variant: "destructive",
        });
      } else {
        setHistoryRefresh((n) => n + 1);

        // Alert admins when rows failed. Best-effort: one call per run, never
        // per row, and a failure here only logs — the import already happened.
        if (skipped > 0 && runRow?.id) {
          try {
            await supabase.functions.invoke("notify-import-errors", {
              body: { runId: runRow.id },
            });
          } catch (notifyErr) {
            console.error("[import] error-alert email failed:", notifyErr);
          }
        }
      }
    }


    setImporting(false);
    setImportResult({ imported, updated, skipped, skippedExisting, excluded, failedRows });
  };


  /**
   * In-file duplicate phones. Rows are grouped on the already-normalised phone
   * held in row.data.phone, so formatting differences in the source file can't
   * hide a collision. Non-blocking: the row still imports, but the operator is
   * told which other rows share the number and that the last one wins.
   */
  const dupPhoneNotes = useMemo(() => {
    const byPhone = new Map<string, number[]>();
    for (const r of parsedRows) {
      const phone = String(r.data.phone || "").trim();
      if (!phone) continue;
      const list = byPhone.get(phone);
      if (list) list.push(r.rowNum);
      else byPhone.set(phone, [r.rowNum]);
    }
    const notes = new Map<number, string>();
    for (const rowNums of byPhone.values()) {
      if (rowNums.length < 2) continue;
      for (const rowNum of rowNums) {
        const others = rowNums.filter((n) => n !== rowNum);
        notes.set(
          rowNum,
          `Duplicate phone in this file (row${others.length === 1 ? "" : "s"} ${others.join(", ")}) — only the last will be saved.`
        );
      }
    }
    return notes;
  }, [parsedRows]);

  /**
   * Lookup keys for the existing-customer query. Phones and GPRNs are matched
   * directly; eircodes widen the net so name + address matches can be found
   * without pulling the whole customer table.
   */
  const lookupKeys = useMemo(() => {
    const phones = new Set<string>();
    const gprns = new Set<string>();
    const eircodes = new Set<string>();
    for (const r of parsedRows) {
      const phone = String(r.data.phone || "").trim();
      if (phone) phones.add(phone);
      const gprn = String(r.data.gprn || "").trim();
      if (gprn) gprns.add(gprn);
      const eircode = String(r.data.eircode || "").trim();
      if (eircode) eircodes.add(eircode);
    }
    return {
      phones: Array.from(phones).sort(),
      gprns: Array.from(gprns).sort(),
      eircodes: Array.from(eircodes).sort(),
    };
  }, [parsedRows]);

  // Stable primitive so the lookup effect only re-runs when the key set changes.
  const lookupSignature = [
    lookupKeys.phones.join("|"),
    lookupKeys.gprns.join("|"),
    lookupKeys.eircodes.join("|"),
  ].join("::");

  /**
   * Batched existing-customer lookup, always filtered by organisation_id so
   * duplicate matching can never cross a tenant boundary.
   */
  useEffect(() => {
    const anyKeys =
      lookupKeys.phones.length + lookupKeys.gprns.length + lookupKeys.eircodes.length;
    if (!orgId || anyKeys === 0) {
      setExistingCandidates(null);
      setExistingById(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const byId = new Map<string, Record<string, any>>();
      const CHUNK = 200;
      const fetchBy = async (column: "phone" | "gprn" | "eircode", values: string[]) => {
        for (let i = 0; i < values.length; i += CHUNK) {
          const chunk = values.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .eq("organisation_id", orgId)
            .in(column, chunk);
          if (cancelled) return false;
          if (error) return false;
          for (const row of data || []) byId.set(row.id, row as Record<string, any>);
        }
        return true;
      };

      const ok =
        (await fetchBy("phone", lookupKeys.phones)) &&
        (await fetchBy("gprn", lookupKeys.gprns)) &&
        (await fetchBy("eircode", lookupKeys.eircodes));
      if (cancelled) return;
      if (!ok) {
        setExistingCandidates(null);
        setExistingById(new Map());
        return;
      }
      setExistingById(byId);
      setExistingCandidates(
        Array.from(byId.values()).map((c) => ({
          id: c.id,
          name: c.name ?? null,
          address: c.address ?? null,
          eircode: c.eircode ?? null,
          phone: c.phone ?? null,
          gprn: c.gprn ?? null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, lookupSignature]);

  /** Existing customers matching a row, or null while the lookup is unresolved. */
  const matchesForRow = useCallback(
    (row: ParsedRow): ExistingMatchResult[] | null => {
      if (!existingCandidates) return null;
      return matchExistingCustomers(row.data, existingCandidates);
    },
    [existingCandidates]
  );

  /**
   * Per-row outcome. "ambiguous" means the row matches several existing customers,
   * so there is no safe record to update — the operator has to resolve those first.
   */
  const rowOutcome = useCallback(
    (row: ParsedRow): "new" | "existing" | "ambiguous" | "unknown" => {
      const matches = matchesForRow(row);
      if (!matches) return "unknown";
      if (matches.length === 0) return "new";
      return matches.length === 1 ? "existing" : "ambiguous";
    },
    [matchesForRow]
  );

  /** Row numbers blocked because they match more than one existing customer. */
  const ambiguousRowNums = useMemo(() => {
    const s = new Set<number>();
    if (!existingCandidates) return s;
    for (const r of parsedRows) {
      if (matchExistingCustomers(r.data, existingCandidates).length > 1) s.add(r.rowNum);
    }
    return s;
  }, [parsedRows, existingCandidates]);

  /** Duplicate clusters inside the uploaded file (GPRN / phone / name+address). */
  const dupGroups = useMemo(
    () => findInFileDuplicateGroups(parsedRows.map((r) => ({ rowNum: r.rowNum, data: r.data }))),
    [parsedRows]
  );

  const rowsByNum = useMemo(() => {
    const m = new Map<number, Record<string, any>>();
    for (const r of parsedRows) m.set(r.rowNum, r.data);
    return m;
  }, [parsedRows]);

  // Pre-select the less complete row in each duplicate group until the operator
  // overrides the suggestion.
  useEffect(() => {
    if (excludeDirty) return;
    const next = new Set<number>();
    for (const g of dupGroups) for (const n of g.suggestedExcludeRowNums) next.add(n);
    setExcludedRowNums(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupGroups, excludeDirty]);

  // A fresh file / remap clears review decisions so nothing stale can be committed.
  useEffect(() => {
    setExcludeDirty(false);
    setDecisions({});
    setConfirmOpen(false);
  }, [dataRows, effectiveColMap]);

  /** Rows matching exactly one existing customer, excluding rows dropped as duplicates. */
  const existingMatchRows = useMemo<ExistingMatchRow[]>(() => {
    if (!existingCandidates) return [];
    const out: ExistingMatchRow[] = [];
    for (const r of parsedRows) {
      if (excludedRowNums.has(r.rowNum)) continue;
      const matches = matchExistingCustomers(r.data, existingCandidates);
      if (matches.length !== 1) continue;
      out.push({
        rowNum: r.rowNum,
        data: r.data,
        reason: matches[0].reason,
        customer: matches[0].customer,
        history: historyCounts.get(matches[0].customer.id) ?? null,
      });
    }
    return out;
  }, [parsedRows, existingCandidates, excludedRowNums, historyCounts]);

  const matchedCustomerIds = useMemo(
    () => Array.from(new Set(existingMatchRows.map((m) => m.customer.id))).sort(),
    [existingMatchRows]
  );
  const matchedIdsSignature = matchedCustomerIds.join("|");

  /** Linked service call / quote / payment counts for matched existing customers. */
  useEffect(() => {
    if (matchedCustomerIds.length === 0) {
      setHistoryCounts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const counts = new Map<string, ExistingHistory>();
      for (const id of matchedCustomerIds) counts.set(id, { jobs: 0, quotes: 0, payments: 0 });
      const tally = async (
        table: "service_calls" | "quotes" | "job_payments",
        key: keyof ExistingHistory
      ) => {
        const { data, error } = await supabase
          .from(table)
          .select("customer_id")
          .in("customer_id", matchedCustomerIds);
        if (error || cancelled) return;
        for (const row of (data || []) as { customer_id: string | null }[]) {
          if (!row.customer_id) continue;
          const entry = counts.get(row.customer_id);
          if (entry) entry[key] += 1;
        }
      };
      await tally("service_calls", "jobs");
      await tally("quotes", "quotes");
      await tally("job_payments", "payments");
      if (!cancelled) setHistoryCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIdsSignature]);

  const toggleExclude = (rowNum: number, exclude: boolean) => {
    setExcludeDirty(true);
    setExcludedRowNums((prev) => {
      const next = new Set(prev);
      if (exclude) next.add(rowNum);
      else next.delete(rowNum);
      return next;
    });
  };

  const setDecision = (rowNum: number, decision: "skip" | "merge") =>
    setDecisions((prev) => ({ ...prev, [rowNum]: decision }));

  // Decorate rows with the in-file duplicate note and the ambiguous-match error,
  // without touching buildRow.
  const decoratedRows = useMemo(
    () =>
      parsedRows.map((r) => {
        const note = dupPhoneNotes.get(r.rowNum);
        const ambiguous = ambiguousRowNums.has(r.rowNum);
        if (!note && !ambiguous) return r;
        let next: ParsedRow = r;
        if (note) {
          next = { ...next, fieldWarnings: { ...next.fieldWarnings, phone: note } };
        }
        if (ambiguous) {
          const count = existingCandidates
            ? matchExistingCustomers(r.data, existingCandidates).length
            : 0;
          const message = `Matches ${count} existing customers — resolve the duplicates first`;
          next = {
            ...next,
            errors: [...next.errors, message],
            fieldErrors: { ...next.fieldErrors, phone: "Ambiguous match" },
            isValid: false,
          };
        }
        return next;
      }),
    [parsedRows, dupPhoneNotes, ambiguousRowNums, existingCandidates]
  );


  // Counts come from the decorated rows so ambiguous-match rows are counted as blocked.
  const validCount = decoratedRows.filter((r) => r.isValid).length;
  const errorCount = decoratedRows.filter((r) => !r.isValid).length;

  // Effective selection: always intersected with the currently-ready rows, so a row
  // that becomes blocked after an edit or remap drops out on its own. Untouched
  // selection means "every ready row".
  const selectedSet = useMemo(() => {
    const s = new Set<number>();
    for (const r of decoratedRows) {
      if (!r.isValid) continue;
      if (!selectionDirty || selectedRowNums.has(r.rowNum)) s.add(r.rowNum);
    }
    return s;
  }, [decoratedRows, selectedRowNums, selectionDirty]);
  const selectedCount = selectedSet.size;

  /** Pre-commit summary of exactly what Confirm Import will do. */
  const commitPlan = useMemo(() => {
    const rows = decoratedRows.filter((r) => r.isValid && selectedSet.has(r.rowNum));
    let create = 0;
    let merge = 0;
    let skipExisting = 0;
    let exclude = 0;
    for (const r of rows) {
      if (excludedRowNums.has(r.rowNum)) {
        exclude++;
        continue;
      }
      const matches = existingCandidates ? matchExistingCustomers(r.data, existingCandidates) : [];
      if (matches.length === 1) {
        if ((decisions[r.rowNum] ?? "skip") === "merge") merge++;
        else skipExisting++;
      } else if (matches.length === 0) {
        create++;
      }
    }
    return { create, merge, skipExisting, exclude, blocked: ambiguousRowNums.size };
  }, [decoratedRows, selectedSet, excludedRowNums, existingCandidates, decisions, ambiguousRowNums]);

  /** Toggle one ready row. First interaction freezes the current implicit selection. */
  const toggleRow = (rowNum: number, checked: boolean) => {
    setSelectedRowNums(() => {
      const base = selectionDirty ? new Set(selectedRowNums) : new Set(selectedSet);
      if (checked) base.add(rowNum);
      else base.delete(rowNum);
      return base;
    });
    setSelectionDirty(true);
  };

  /** Select or clear every ready row on the current page. */
  const togglePage = (checked: boolean) => {
    setSelectedRowNums(() => {
      const base = selectionDirty ? new Set(selectedRowNums) : new Set(selectedSet);
      for (const r of displayRows) {
        if (!r.isValid) continue;
        if (checked) base.add(r.rowNum);
        else base.delete(r.rowNum);
      }
      return base;
    });
    setSelectionDirty(true);
  };




  const totalPages = Math.max(1, Math.ceil(parsedRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const displayRows = decoratedRows.slice(pageStart, pageStart + PAGE_SIZE);
  const importBlocked = missingRequired.length > 0;

  // For dropdowns: which raw-header indices are already assigned to some field
  const assignedIndices = useMemo(() => {
    const s = new Set<number>();
    for (const idx of Object.values(effectiveColMap)) s.add(idx);
    return s;
  }, [effectiveColMap]);

  const setFieldMapping = (fieldKey: string, value: string) => {
    if (value === "") {
      setManualMap((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      return;
    }
    const idx = parseInt(value, 10);
    if (!Number.isFinite(idx)) return;
    setManualMap((prev) => ({ ...prev, [fieldKey]: idx }));
  };

  const MappingDropdown = ({ fieldKey }: { fieldKey: string }) => {
    const currentIdx = effectiveColMap[fieldKey];
    return (
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value={currentIdx !== undefined ? String(currentIdx) : ""}
        onChange={(e) => setFieldMapping(fieldKey, e.target.value)}
      >
        <option value="">— Leave blank —</option>
        {rawHeaders.map((h, i) => {
          if (!h) return null;
          const takenByOther = assignedIndices.has(i) && effectiveColMap[fieldKey] !== i;
          return (
            <option key={i} value={String(i)} disabled={takenByOther}>
              {h}
              {takenByOther ? " (used)" : ""}
            </option>
          );
        })}
      </select>
    );
  };

  /** Session-only editable cell for the preview table. */
  const EditableCell = ({
    row,
    fieldKey,
    display,
  }: {
    row: ParsedRow;
    fieldKey: string;
    display: string;
  }) => {
    const editValue = rowEdits[row.srcIndex]?.[fieldKey];
    const shownValue = editValue !== undefined ? editValue : display;
    const err = row.fieldErrors[fieldKey];
    const warn = row.fieldWarnings?.[fieldKey];
    const [local, setLocal] = useState(shownValue);

    // Keep local in sync when upstream row changes (remap, page change).
    useEffect(() => {
      setLocal(shownValue);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shownValue]);

    return (
      <div className="space-y-1">
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (local !== shownValue) updateEdit(row.srcIndex, fieldKey, local);
          }}
          className={`h-8 w-full rounded-md border bg-background px-2 text-xs ${
            err
              ? "border-destructive ring-1 ring-destructive/40"
              : warn
                ? "border-warning ring-1 ring-warning/40"
                : "border-input"
          }`}
        />
        {err && <p className="text-[10px] text-destructive">{err}</p>}
        {!err && warn && <p className="text-[10px] text-warning">{warn}</p>}
      </div>
    );
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (importResult) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold">Import Customers</h1>
          </div>
        </header>
        <div className="max-w-lg mx-auto px-4 py-12 space-y-4">
          <Card>
            <CardContent className="pt-8 text-center space-y-4">
              <div className="text-5xl">{importResult.skipped > 0 ? "⚠️" : "✅"}</div>
              <h2 className="text-xl font-bold">Import Complete!</h2>
              <div className="space-y-1 text-sm">
                <p><strong>{importResult.imported}</strong> customers imported successfully</p>
                <p><strong>{importResult.updated}</strong> customers updated</p>
                {importResult.excluded > 0 && (
                  <p><strong>{importResult.excluded}</strong> duplicate rows excluded</p>
                )}
                {importResult.skippedExisting > 0 && (
                  <p><strong>{importResult.skippedExisting}</strong> existing customers skipped</p>
                )}
                {importResult.skipped > 0 && (
                  <p className="text-destructive font-medium"><strong>{importResult.skipped}</strong> rows failed</p>
                )}
              </div>
              <div className="flex gap-3 justify-center pt-4">
                <Button onClick={() => navigate("/customers")}>View Customers</Button>
                <Button variant="outline" onClick={() => {
                  clearFile();
                  setImportResult(null);
                }}>
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>

          {importResult.failedRows.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  Failed Rows ({importResult.failedRows.length})
                </h3>
                <div className="divide-y divide-border">
                  {importResult.failedRows.map((fr, idx) => (
                    <div key={idx} className="py-2 text-sm">
                      <p className="font-medium">{fr.name}</p>
                      <p className="text-muted-foreground text-xs">{fr.reason}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Blocked rows no longer gate the file: only an empty selection disables the commit.
  const importLabel = importBlocked
    ? `Map ${missingRequired.length} required column${missingRequired.length === 1 ? "" : "s"} to continue`
    : selectedCount === 0
    ? "Select at least one row"
    : `Import ${selectedCount} customer${selectedCount === 1 ? "" : "s"}`;

  const importDisabled = importBlocked || selectedCount === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Import Customers</h1>
            <p className="text-sm text-muted-foreground">Upload your Excel file to bulk-import or update customer records.</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-base font-medium mb-1">Drag & drop your Excel file here</p>
          <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
          <p className="text-xs text-muted-foreground">Accepted: .xlsx &nbsp; Max size: 5MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* Selected file */}
        {file && (
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={clearFile} className="text-sm text-destructive hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        )}

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
          <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Need the template?</p>
            <p className="text-sm text-muted-foreground mb-2">
              Download the Karl's Gas import template — it has all the right columns and includes 4 example customers.
            </p>
            <Button variant="outline" size="sm" onClick={generateImportTemplate}>
              ⬇ Download Template (.xlsx)
            </Button>
          </div>
        </div>

        {/* Validate button */}
        {file && !validated && (
          <Button onClick={readFile} className="w-full">
            Validate File
          </Button>
        )}

        {/* Column mapping + validation results */}
        {validated && (
          <>
            {/* Column Mapping Card */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Columns found in your file</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {rawHeaders.filter(Boolean).map((h, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">{h}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Recognised fields</h3>
                  {Object.keys(effectiveColMap).length === 0 ? (
                    <p className="text-xs text-muted-foreground">None yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                      {Object.entries(effectiveColMap).map(([fieldKey, idx]) => (
                        <div key={fieldKey} className="flex items-center gap-2">
                          <span className="text-muted-foreground truncate">{rawHeaders[idx] || `Column ${idx + 1}`}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium">{FIELD_LABEL[fieldKey] || fieldKey}</span>
                          {manualMap[fieldKey] !== undefined && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">manual</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing required — blocking */}
                {missingRequired.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-destructive">
                          Import blocked: {missingRequired.length} required column
                          {missingRequired.length === 1 ? "" : "s"} missing.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          We couldn't find a column for the field(s) below. Map them manually or fix your file's headers.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {missingRequired.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs">
                          <span className="w-32 font-medium">{FIELD_LABEL[f]}</span>
                          <MappingDropdown fieldKey={f} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing optional — non-blocking */}
                {missingOptional.length > 0 && (
                  <details className="rounded-lg border border-border bg-muted/30 p-3">
                    <summary className="cursor-pointer text-sm flex items-center gap-2">
                      <Info className="w-4 h-4 text-muted-foreground" />
                      <span>
                        {missingOptional.length} optional field
                        {missingOptional.length === 1 ? "" : "s"} not matched — will be left blank
                      </span>
                    </summary>
                    <p className="text-xs text-muted-foreground mt-2 mb-3">
                      These fields aren't required, but if your file has them under different header names you can map them manually.
                    </p>
                    <div className="space-y-2">
                      {missingOptional.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs">
                          <span className="w-40 truncate">{FIELD_LABEL[f] || f}</span>
                          <MappingDropdown fieldKey={f} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>

            {/* Summary banner — only when required columns are all mapped */}
            {!importBlocked && errorCount === 0 && validCount > 0 && (
              <div className="flex items-center gap-2 bg-success/10 border border-success/30 text-success rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">{validCount} rows ready to import. No errors found.</span>
              </div>
            )}
            {!importBlocked && errorCount > 0 && validCount > 0 && (
              <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent-foreground rounded-lg p-3">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {validCount} rows ready · {errorCount} rows have errors — edit the red cells below to fix.
                </span>
              </div>
            )}
            {!importBlocked && validCount === 0 && parsedRows.length > 0 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3">
                <XCircle className="w-5 h-5" />
                <span className="text-sm font-medium">No rows can be imported. Fix the red cells below.</span>
              </div>
            )}

            {/* Preview table */}
            {parsedRows.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            {(() => {
                              const pageReady = displayRows.filter((r) => r.isValid);
                              const allChecked =
                                pageReady.length > 0 && pageReady.every((r) => selectedSet.has(r.rowNum));
                              return (
                                <Checkbox
                                  checked={allChecked}
                                  disabled={pageReady.length === 0}
                                  onCheckedChange={(v) => togglePage(v === true)}
                                  aria-label="Select all ready rows on this page"
                                />
                              );
                            })()}
                          </TableHead>
                          <TableHead className="w-14">Row</TableHead>
                          <TableHead>Customer Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead className="hidden md:table-cell">Address</TableHead>
                          <TableHead className="hidden md:table-cell">Eircode</TableHead>
                          <TableHead className="hidden lg:table-cell">GPRN</TableHead>
                          <TableHead className="hidden lg:table-cell">Engineer Notes</TableHead>
                          <TableHead className="hidden lg:table-cell">Customer Notes</TableHead>
                          <TableHead className="w-24">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayRows.map((r) => (
                          <TableRow
                            key={r.rowNum}
                            className={!r.isValid ? "border-l-[3px] border-l-destructive bg-destructive/5" : "border-l-[3px] border-l-success"}
                          >
                            <TableCell className="align-top pt-3">
                              <Checkbox
                                checked={r.isValid && selectedSet.has(r.rowNum)}
                                disabled={!r.isValid}
                                onCheckedChange={(v) => toggleRow(r.rowNum, v === true)}
                                aria-label={`Include row ${r.rowNum} in this import`}
                                title={
                                  r.isValid
                                    ? undefined
                                    : "This row can't be imported until its errors are fixed"
                                }
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground align-top pt-3">{r.rowNum}</TableCell>
                            <TableCell className="min-w-[160px] align-top">
                              <EditableCell row={r} fieldKey="name" display={r.data.name || ""} />
                            </TableCell>
                            <TableCell className="min-w-[140px] align-top">
                              <EditableCell row={r} fieldKey="phone" display={r.data.phone || ""} />
                            </TableCell>
                            <TableCell className="hidden md:table-cell min-w-[180px] align-top">
                              <EditableCell row={r} fieldKey="address" display={r.data.address || ""} />
                            </TableCell>
                            <TableCell className="hidden md:table-cell min-w-[120px] align-top">
                              <EditableCell row={r} fieldKey="eircode" display={r.data.eircode || ""} />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell min-w-[130px] align-top">
                              <EditableCell row={r} fieldKey="gprn" display={r.data.gprn || ""} />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell min-w-[180px] align-top">
                              <EditableCell row={r} fieldKey="engineer_notes" display={r.data.engineer_notes || ""} />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell min-w-[180px] align-top">
                              <EditableCell row={r} fieldKey="notes" display={r.data.notes || ""} />
                            </TableCell>
                            <TableCell className="align-top pt-3">
                              <div className="flex flex-col items-start gap-1">
                                {r.isValid ? (
                                  <Badge className="bg-success text-success-foreground">✓ Ready</Badge>
                                ) : (
                                  <Badge variant="destructive" title={r.errors.join(" · ")}>✕ Error</Badge>
                                )}
                                {(() => {
                                  const outcome = rowOutcome(r);
                                  if (outcome === "unknown") return null;
                                  const matches = matchesForRow(r) || [];
                                  const describe = (m: ExistingMatchResult) =>
                                    [m.customer.name || "Unnamed customer", m.customer.address]
                                      .filter(Boolean)
                                      .join(", ");
                                  if (outcome === "ambiguous") {
                                    return (
                                      <Badge
                                        variant="destructive"
                                        title={`Matched: ${matches.map(describe).join(" · ")}`}
                                      >
                                        Conflict — matches {matches.length} customers
                                      </Badge>
                                    );
                                  }
                                  if (outcome === "existing") {
                                    const decision = decisions[r.rowNum] ?? "skip";
                                    return (
                                      <Badge
                                        variant="outline"
                                        title={
                                          matches[0]
                                            ? `Already exists: ${describe(matches[0])}`
                                            : "This row matches an existing customer"
                                        }
                                      >
                                        {decision === "merge" ? "Will merge" : "Already exists"}
                                      </Badge>
                                    );
                                  }
                                  return (
                                    <Badge variant="secondary" title="No matching customer exists — this row will create a new one">
                                      New
                                    </Badge>
                                  );
                                })()}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {parsedRows.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
                      <span>
                        Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, parsedRows.length)} of {parsedRows.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={clampedPage <= 1}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Prev
                        </Button>
                        <span>Page {clampedPage} of {totalPages}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={clampedPage >= totalPages}
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* In-progress bar (footer hides while importing) */}
            {importing && (
              <div className="space-y-2">
                <Progress value={importProgress} className="h-1.5" />
                <p className="text-sm text-center text-muted-foreground">Importing... {importProgress}%</p>
              </div>
            )}
          </>
        )}

        {/* Read-only audit trail of past imports for this organisation */}
        <div className="mt-8">
          <ImportRunHistory orgId={orgId} refreshKey={historyRefresh} />
        </div>
      </div>

      {/* Sticky footer summary */}
      {validated && parsedRows.length > 0 && !importing && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 z-40">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-success/10 text-success border border-success/30">
                Selected: {selectedCount} of {validCount} ready
              </Badge>
              {errorCount > 0 && (
                <Badge className="bg-destructive/10 text-destructive border border-destructive/30">
                  {errorCount} blocked — still needs fixing
                </Badge>
              )}
            </div>
            <Button onClick={handleImport} disabled={importDisabled}>
              {importLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportCustomers;
