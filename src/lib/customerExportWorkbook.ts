import * as XLSX from "xlsx-js-style";
import { EXPORT_COLUMNS, TEXT_EXPORT_COLUMNS, type ExportRow } from "@/lib/customerExportFormat";

/**
 * Writes the customer export workbook from rows already built by
 * buildExportRows — there is no second formatting path.
 */
export const exportCustomersToExcel = (rows: ExportRow[], filename?: string) => {
  const headers = [...EXPORT_COLUMNS] as string[];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

  // Force identifier columns to text cells so Excel cannot strip "+", leading
  // zeros, or convert them to numbers / scientific notation.
  headers.forEach((header, colIdx) => {
    if (!TEXT_EXPORT_COLUMNS.includes(header as any)) return;
    for (let rowIdx = 1; rowIdx <= rows.length; rowIdx++) {
      const ref = XLSX.utils.encode_cell({ c: colIdx, r: rowIdx });
      const cell = ws[ref];
      if (!cell) continue;
      cell.t = "s";
      cell.v = String(cell.v ?? "");
      cell.z = "@";
    }
  });

  ws["!cols"] = headers.map((h) => ({
    wch: h === "Address" ? 30 : h === "Email" ? 26 : h === "Customer Notes" || h === "Engineer Notes" || h === "Access Notes" ? 28 : Math.max(12, Math.min(h.length + 4, 24)),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  XLSX.writeFile(wb, filename || `customers_export_${new Date().toISOString().split("T")[0]}.xlsx`);
};
