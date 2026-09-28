import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWarrantyWelcome, isInstallJob, lookupWarrantyYears } from "./warrantyWelcome.ts";

Deno.test("isInstallJob by K&N job types", () => {
  for (const t of ["Boiler Replacement", "Installation", "Install"]) assertEquals(isInstallJob({ job_type: t }), true, t);
  for (const t of ["Boiler Service", "Boiler Repair", "Repair", "Emergency"]) assertEquals(isInstallJob({ job_type: t }), false, t);
});

Deno.test("isInstallJob via New Boiler Fitted tag", () => {
  assertEquals(isInstallJob({ job_type: "Boiler Service" }, ["new boiler FITTED"]), true);
  assertEquals(isInstallJob({ job_type: "Boiler Service" }, ["Under Warranty"]), false);
});

const base = { firstName: "Mary", tenantName: "Dublin Gas", tenantPhone: "01 234 5678", footer: "Dublin Gas | Swords" };
const banned = (s: string) => { for (const w of ["K&N", "Karl", "Gas Safe"]) assert(!s.includes(w), w); };

Deno.test("buildWarrantyWelcome full data", () => {
  const m = buildWarrantyWelcome({ ...base, brand: "Worcester", model: "Greenstar 4000", warrantyYears: 10 });
  assertEquals(m, [
    "Hi Mary, thanks for choosing Dublin Gas.",
    "Your new Worcester Greenstar 4000 boiler is now fitted and covered by a 10-year manufacturer's warranty.",
    "To keep your warranty valid, your boiler needs to be serviced once a year by a Registered Gas Installer (RGII). We'll remind you when your first service is due.",
    "Any questions, call us on 01 234 5678.",
    "Dublin Gas | Swords",
  ].join("\n"));
  banned(m);
});

Deno.test("buildWarrantyWelcome variants", () => {
  const noBrand = buildWarrantyWelcome({ ...base, warrantyYears: 5 });
  assert(noBrand.includes("Your new boiler is now fitted and covered by a 5-year"));
  const brandOnly = buildWarrantyWelcome({ ...base, brand: "Vaillant" });
  assert(brandOnly.includes("Your new Vaillant boiler is now fitted."));
  assert(buildWarrantyWelcome({ ...base, warrantyYears: null }).includes("boiler is now fitted."));
  assert(buildWarrantyWelcome({ ...base, warrantyYears: 0 }).includes("boiler is now fitted."));
  const noPhone = buildWarrantyWelcome({ ...base, tenantPhone: "" });
  assert(!noPhone.includes("Any questions"));
  for (const m of [noBrand, brandOnly, noPhone]) banned(m);
});

Deno.test("lookupWarrantyYears no fallback", () => {
  const brands = [
    { brand_name: "Worcester", model_name: null, warranty_years: 7, is_default: true },
    { brand_name: "Worcester", model_name: "Greenstar 8000", warranty_years: 12, is_default: false },
  ];
  assertEquals(lookupWarrantyYears("Worcester Greenstar 8000", brands), 12);
  assertEquals(lookupWarrantyYears("Worcester Other", brands), 7);
  assertEquals(lookupWarrantyYears("Unknown", brands), null);
});
