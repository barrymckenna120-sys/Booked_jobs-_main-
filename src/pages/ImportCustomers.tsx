import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { generateImportTemplate } from "@/lib/generateTemplate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import * as XLSX from "xlsx-js-style";

/** Map recognisable Excel header names (lower-cased, trimmed) → internal field */
const HEADER_TO_FIELD: Record<string, string> = {
  "customer name": "name",
  "mobile number": "phone",
  "phone number": "phone",
  "phone": "phone",
  "email": "email",
  "address": "address",
  "eircode": "eircode",
  "area code": "area_code",
  "area": "area_code",
  "access notes": "access_notes",
  "boiler make / model": "boiler_make_model",
  "boiler make/model": "boiler_make_model",
  "boiler type": "boiler_type",
  "installation date": "boiler_installation_date",
  "under warranty": "under_warranty",
  "last service date": "last_service_date",
  "last service engineer": "last_service_engineer",
  "engineer notes": "engineer_notes",
  "next service due": "next_service_due",
  "service status": "service_status",
  "assigned engineer": "assigned_engineer",
  "customer notes": "notes",
  "notes": "notes",
  "customer since": "customer_since",
};

/** Headers we look for to identify the header row */
const KNOWN_HEADERS = ["customer name", "mobile number", "phone number", "address", "eircode"];

/** Scan the first N rows to find the header row index and build a column map */
function detectHeaderRow(allRows: any[][]): { headerIdx: number; colMap: Record<string, number> } | null {
  const scanLimit = Math.min(10, allRows.length);
  for (let i = 0; i < scanLimit; i++) {
    const row = allRows[i];
    if (!row || row.length < 3) continue;
    const lowered = row.map((c: any) => String(c ?? "").trim().toLowerCase());
    const matchCount = KNOWN_HEADERS.filter((h) => lowered.includes(h)).length;
    if (matchCount >= 3) {
      // Build column map from this row
      const colMap: Record<string, number> = {};
      for (let col = 0; col < lowered.length; col++) {
        const field = HEADER_TO_FIELD[lowered[col]];
        if (field && !(field in colMap)) colMap[field] = col;
      }
      return { headerIdx: i, colMap };
    }
  }
  return null;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  // If SheetJS has already parsed this as a Date object, use it directly
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    const dd = String(val.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const str = String(val).trim();
  // DD/MM/YYYY
  const irish = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (irish) return `${irish[3]}-${irish[2].padStart(2, "0")}-${irish[1].padStart(2, "0")}`;
  // YYYY-MM-DD (with optional time portion e.g. "2026-10-01 00:00:00")
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function cellStr(row: any[], idx: number): string {
  const v = row[idx];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

type ParsedRow = {
  rowNum: number;
  data: Record<string, any>;
  errors: string[];
  isValid: boolean;
};

const ImportCustomers = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validated, setValidated] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
  } | null>(null);

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
  };

  const validateFile = async () => {
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(data), { type: "array" });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("customer")) || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Dynamically find the header row
    const detected = detectHeaderRow(allRows);
    if (!detected) {
      toast({ title: "Header row not found", description: "Could not find a row with recognisable column headers (Customer Name, Address, Eircode, etc).", variant: "destructive" });
      return;
    }
    const { headerIdx, colMap } = detected;

    // Helper to get a field value from a row using the dynamic column map
    const field = (row: any[], key: string): string => {
      const idx = colMap[key];
      return idx !== undefined ? cellStr(row, idx) : "";
    };

    // Data rows start immediately after the header row
    const dataRows = allRows.slice(headerIdx + 1);
    const results: ParsedRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = field(row, "name");
      const phone = field(row, "phone");
      const address = field(row, "address");

      // Stop at empty rows
      if (!name && !phone && !address) break;

      const errors: string[] = [];
      const eircode = field(row, "eircode");
      const boilerType = field(row, "boiler_type");
      const underWarranty = field(row, "under_warranty");
      const serviceStatus = field(row, "service_status");

      if (!name) errors.push("Customer Name is required");
      if (!phone) errors.push("Phone Number is required");
      if (!address) errors.push("Address is required");
      if (!eircode) errors.push("Eircode is required");
      if (boilerType && !["Gas", "Oil"].includes(boilerType)) errors.push("Boiler Type must be Gas or Oil");
      if (underWarranty && !["Yes", "No"].includes(underWarranty)) errors.push("Under Warranty must be Yes or No");
      if (serviceStatus && !["Overdue", "Due Soon", "Up to Date"].includes(serviceStatus))
        errors.push("Status must be: Overdue, Due Soon, or Up to Date");

      // Date validations
      const dateFieldKeys = [
        { key: "boiler_installation_date", label: "Installation Date" },
        { key: "last_service_date", label: "Last Service Date" },
        { key: "next_service_due", label: "Next Service Due" },
        { key: "customer_since", label: "Customer Since" },
      ];
      for (const df of dateFieldKeys) {
        const val = field(row, df.key);
        // Skip validation if it's already a Date object (SheetJS parsed it)
        if (val && !(val instanceof Date) && !parseDate(val)) {
          errors.push(`${df.label} must be a valid date (DD/MM/YYYY, YYYY-MM-DD, or Excel datetime)`);
        }
      }

      results.push({
        rowNum: headerIdx + 2 + i, // 1-based Excel row number
        data: {
          name,
          phone,
          email: field(row, "email"),
          address,
          eircode,
          area_code: field(row, "area_code"),
          access_notes: field(row, "access_notes"),
          boiler_make_model: field(row, "boiler_make_model"),
          boiler_type: boilerType || null,
          boiler_installation_date: parseDate(field(row, "boiler_installation_date")),
          under_warranty: underWarranty === "Yes" ? true : underWarranty === "No" ? false : null,
          last_service_date: parseDate(field(row, "last_service_date")),
          last_service_engineer: field(row, "last_service_engineer"),
          engineer_notes: field(row, "engineer_notes"),
          next_service_due: parseDate(field(row, "next_service_due")),
          service_status: serviceStatus || "Up to Date",
          assigned_engineer: field(row, "assigned_engineer"),
          notes: field(row, "notes"),
          customer_since: parseDate(field(row, "customer_since")),
        },
        errors,
        isValid: errors.length === 0,
      });
    }

    setParsedRows(results);
    setValidated(true);
  };

  const handleImport = async () => {
    if (!user) return;
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        // Check if customer with same phone exists
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", row.data.phone)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("customers")
            .update(row.data)
            .eq("id", existing.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase
            .from("customers")
            .insert([{ ...row.data, user_id: user.id } as any]);
          if (error) throw error;
          imported++;
        }
      } catch (err: any) {
        skipped++;
        toast({
          title: `Error on row ${row.rowNum}`,
          description: err.message,
          variant: "destructive",
        });
      }

      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setImporting(false);
    setImportResult({ imported, updated, skipped });
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = parsedRows.filter((r) => !r.isValid).length;
  const displayRows = parsedRows.slice(0, 20);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Import complete screen
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
        <div className="max-w-md mx-auto px-4 py-12">
          <Card>
            <CardContent className="pt-8 text-center space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold">Import Complete!</h2>
              <div className="space-y-1 text-sm">
                <p><strong>{importResult.imported}</strong> customers imported</p>
                <p><strong>{importResult.updated}</strong> customers updated</p>
                {importResult.skipped > 0 && (
                  <p><strong>{importResult.skipped}</strong> rows skipped (errors)</p>
                )}
              </div>
              <div className="flex gap-3 justify-center pt-4">
                <Button onClick={() => navigate("/dashboard")}>View Customers</Button>
                <Button variant="outline" onClick={() => {
                  clearFile();
                  setImportResult(null);
                }}>
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
          <Button onClick={validateFile} className="w-full">
            Validate File
          </Button>
        )}

        {/* Validation results */}
        {validated && (
          <>
            {/* Summary banner */}
            {errorCount === 0 && validCount > 0 && (
              <div className="flex items-center gap-2 bg-success/10 border border-success/30 text-success rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">{validCount} rows ready to import. No errors found.</span>
              </div>
            )}
            {errorCount > 0 && validCount > 0 && (
              <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent-foreground rounded-lg p-3">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm font-medium">{validCount} rows ready · {errorCount} rows have errors (shown in red below)</span>
              </div>
            )}
            {validCount === 0 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3">
                <XCircle className="w-5 h-5" />
                <span className="text-sm font-medium">No rows can be imported. Fix errors and re-upload.</span>
              </div>
            )}

            {/* Preview table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="hidden md:table-cell">Address</TableHead>
                        <TableHead className="hidden md:table-cell">Eircode</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Validation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map((r) => (
                        <TableRow
                          key={r.rowNum}
                          className={!r.isValid ? "border-l-[3px] border-l-destructive bg-destructive/5" : "border-l-[3px] border-l-success"}
                        >
                          <TableCell className="text-muted-foreground">{r.rowNum}</TableCell>
                          <TableCell className="font-medium">{r.data.name}</TableCell>
                          <TableCell>{r.data.phone}</TableCell>
                          <TableCell className="hidden md:table-cell">{r.data.address}</TableCell>
                          <TableCell className="hidden md:table-cell">{r.data.eircode}</TableCell>
                          <TableCell>{r.data.service_status}</TableCell>
                          <TableCell>
                            {r.isValid ? (
                              <Badge className="bg-success text-success-foreground">✓ Ready</Badge>
                            ) : (
                              <Badge variant="destructive">✕ {r.errors[0]}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {parsedRows.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 20 of {parsedRows.length} rows
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Import button / progress */}
            {importing ? (
              <div className="space-y-2">
                <Progress value={importProgress} className="h-1.5" />
                <p className="text-sm text-center text-muted-foreground">Importing... {importProgress}%</p>
              </div>
            ) : (
              <Button onClick={handleImport} disabled={validCount === 0} className="w-full">
                Import {validCount} Customers
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImportCustomers;
