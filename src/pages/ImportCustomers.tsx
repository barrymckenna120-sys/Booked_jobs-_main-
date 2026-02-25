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
import * as XLSX from "xlsx";

const COLUMN_MAP = {
  name: 0,
  phone: 1,
  email: 2,
  address: 3,
  eircode: 4,
  area_code: 5,
  access_notes: 6,
  boiler_make_model: 7,
  boiler_type: 8,
  boiler_installation_date: 9,
  under_warranty: 10,
  last_service_date: 11,
  last_service_engineer: 12,
  engineer_notes: 13,
  next_service_due: 14,
  service_status: 15,
  assigned_engineer: 16,
  notes: 17,
  customer_since: 18,
};

function parseIrishDate(val: string): string | null {
  if (!val) return null;
  const str = String(val).trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [_, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

    // Start from row 6 (index 5), skip header/example rows
    const dataRows = allRows.slice(5);
    const results: ParsedRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = cellStr(row, COLUMN_MAP.name);
      const phone = cellStr(row, COLUMN_MAP.phone);
      const address = cellStr(row, COLUMN_MAP.address);

      // Stop at empty rows
      if (!name && !phone && !address) break;

      const errors: string[] = [];
      const eircode = cellStr(row, COLUMN_MAP.eircode);
      const boilerType = cellStr(row, COLUMN_MAP.boiler_type);
      const underWarranty = cellStr(row, COLUMN_MAP.under_warranty);
      const serviceStatus = cellStr(row, COLUMN_MAP.service_status);

      if (!name) errors.push("Customer Name is required");
      if (!phone) errors.push("Phone Number is required");
      if (!address) errors.push("Address is required");
      if (!eircode) errors.push("Eircode is required");
      if (boilerType && !["Gas", "Oil"].includes(boilerType)) errors.push("Boiler Type must be Gas or Oil");
      if (underWarranty && !["Yes", "No"].includes(underWarranty)) errors.push("Under Warranty must be Yes or No");
      if (serviceStatus && !["Overdue", "Due Soon", "Up to Date"].includes(serviceStatus))
        errors.push("Status must be: Overdue, Due Soon, or Up to Date");

      // Date validations
      const dateFields = [
        { idx: COLUMN_MAP.boiler_installation_date, label: "Installation Date" },
        { idx: COLUMN_MAP.last_service_date, label: "Last Service Date" },
        { idx: COLUMN_MAP.next_service_due, label: "Next Service Due" },
        { idx: COLUMN_MAP.customer_since, label: "Customer Since" },
      ];
      for (const df of dateFields) {
        const val = cellStr(row, df.idx);
        if (val && !parseIrishDate(val)) errors.push(`${df.label} must be in DD/MM/YYYY format`);
      }

      results.push({
        rowNum: i + 6,
        data: {
          name,
          phone,
          email: cellStr(row, COLUMN_MAP.email),
          address,
          eircode,
          area_code: cellStr(row, COLUMN_MAP.area_code),
          access_notes: cellStr(row, COLUMN_MAP.access_notes),
          boiler_make_model: cellStr(row, COLUMN_MAP.boiler_make_model),
          boiler_type: boilerType || null,
          boiler_installation_date: parseIrishDate(cellStr(row, COLUMN_MAP.boiler_installation_date)),
          under_warranty: underWarranty === "Yes" ? true : underWarranty === "No" ? false : null,
          last_service_date: parseIrishDate(cellStr(row, COLUMN_MAP.last_service_date)),
          last_service_engineer: cellStr(row, COLUMN_MAP.last_service_engineer),
          engineer_notes: cellStr(row, COLUMN_MAP.engineer_notes),
          next_service_due: parseIrishDate(cellStr(row, COLUMN_MAP.next_service_due)),
          service_status: serviceStatus || "Up to Date",
          assigned_engineer: cellStr(row, COLUMN_MAP.assigned_engineer),
          notes: cellStr(row, COLUMN_MAP.notes),
          customer_since: parseIrishDate(cellStr(row, COLUMN_MAP.customer_since)),
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
