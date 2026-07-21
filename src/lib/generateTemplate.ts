import * as XLSX from "xlsx-js-style";

export const generateImportTemplate = () => {
  const wb = XLSX.utils.book_new();

  // Title row, blank row, category headers, column headers, example row
  const data: any[][] = [
    ["Karl's Gas — Customer Import Template"],
    [],
    [
      "CONTACT INFO", "", "", "", "", "",
      "ACCESS",
      "BOILER INFO", "", "", "", "",
      "SERVICE HISTORY", "", "", "", "", "",
      "OTHER", "",
    ],
    [
      "Customer Name", "Phone Number", "Email", "Address", "Eircode", "Area Code",
      "Access Notes",
      "Boiler Brand", "Boiler Model", "Boiler Type", "Installation Date", "Under Warranty",
      "Last Service Date", "Last Service Engineer", "Engineer Notes", "Next Service Due", "Service Status", "Assigned Engineer",
      "Customer Notes", "Customer Since",
    ],
    [
      "John Murphy", "087 123 4567", "john@example.com", "12 Main St, Swords", "K67 AB12", "01",
      "Side gate, key under mat",
      "Vaillant", "ecoTEC Plus", "Gas", "15/03/2019", "No",
      "10/11/2024", "Barry McKenna", "Filter replaced", "10/11/2025", "Up to Date", "Barry McKenna",
      "Loyal customer, always pays on time", "01/06/2018",
    ],
    [
      "Mary O'Brien", "086 987 6543", "mary.obrien@gmail.com", "45 Oak Drive, Malahide", "D13 XY98", "01",
      "Ring doorbell, dog in garden",
      "Worcester", "Greenstar", "Oil", "22/08/2020", "Yes",
      "05/03/2024", "Karl", "Annual service done", "05/03/2025", "Due Soon", "Karl",
      "", "15/01/2020",
    ],
    [
      "Paddy Dunne", "085 555 1234", "", "8 River Lane, Navan", "C15 PQ34", "046",
      "",
      "Baxi", "600", "Gas", "01/12/2017", "No",
      "20/06/2023", "Barry McKenna", "Needs new pump next visit", "20/06/2024", "Overdue", "Barry McKenna",
      "Cash payments only", "10/09/2017",
    ],
    [
      "Sarah Kelly", "083 222 9876", "sarah.k@hotmail.com", "3 Castle View, Trim", "C15 LM56", "046",
      "Enter through back door",
      "Ideal", "Logic+", "Gas", "30/06/2021", "Yes",
      "12/01/2025", "Karl", "All good", "12/01/2026", "Up to Date", "Karl",
      "Prefers morning appointments", "05/03/2021",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 20 }, // A - Name
    { wch: 16 }, // B - Phone
    { wch: 24 }, // C - Email
    { wch: 28 }, // D - Address
    { wch: 12 }, // E - Eircode
    { wch: 10 }, // F - Area Code
    { wch: 28 }, // G - Access Notes
    { wch: 18 }, // H - Boiler Brand
    { wch: 22 }, // I - Boiler Model
    { wch: 12 }, // J - Boiler Type
    { wch: 16 }, // K - Installation Date
    { wch: 14 }, // L - Under Warranty
    { wch: 16 }, // M - Last Service Date
    { wch: 20 }, // N - Last Service Engineer
    { wch: 28 }, // O - Engineer Notes
    { wch: 16 }, // P - Next Service Due
    { wch: 14 }, // Q - Service Status
    { wch: 20 }, // R - Assigned Engineer
    { wch: 32 }, // S - Customer Notes
    { wch: 16 }, // T - Customer Since
  ];

  // Merge title row across all columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 19 } }];

  XLSX.utils.book_append_sheet(wb, ws, "Customer Import");
  XLSX.writeFile(wb, "karls_gas_customer_import.xlsx");
};
