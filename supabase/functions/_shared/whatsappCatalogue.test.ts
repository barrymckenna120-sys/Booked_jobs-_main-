import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCatalogueMessage,
  CATALOGUE_FUNCTIONS,
  CATALOGUE_KEYS,
  CATALOGUE_MESSAGE_TYPES,
  EXCLUDED_SEND_PATHS,
  fmtGroupedEuro,
  fmtPlainEuro,
  fmtReceiptAmount,
  fmtRoundedEuro,
  getCatalogueEntry,
  WHATSAPP_CATALOGUE,
} from "./whatsappCatalogue.ts";

const FUNCTIONS_DIR = new URL("../", import.meta.url);

/**
 * Functions that reference 360Messenger only to READ or WRITE configuration —
 * they never send a message, so they are correctly absent from the catalogue.
 */
const CONFIG_ONLY_FUNCTIONS = [
  "generate-accountant-export",
  "get-template-status",
  "provision-tenant",
  "provision-whatsapp-templates",
];

// ---------------------------------------------------------------------------
// Structural integrity
// ---------------------------------------------------------------------------

Deno.test("keys are unique and non-empty", () => {
  assertEquals(new Set(CATALOGUE_KEYS).size, CATALOGUE_KEYS.length);
  for (const key of CATALOGUE_KEYS) assert(key.length > 0, "empty catalogue key");
});

Deno.test("every entry declares the audit metadata the Admin UI renders", () => {
  for (const e of WHATSAPP_CATALOGUE) {
    assert(e.name.length > 0, `${e.key}: missing name`);
    assert(e.category.length > 0, `${e.key}: missing category`);
    assert(e.functions.length > 0, `${e.key}: no owning function`);
    assert(Array.isArray(e.variables), `${e.key}: variables must be an array`);
    assert(Array.isArray(e.config), `${e.key}: config must be an array`);
    assert(Array.isArray(e.skipRules), `${e.key}: skipRules must be an array`);
    assert(Array.isArray(e.knownDefects), `${e.key}: knownDefects must be an array`);
    if (!e.build) {
      assert(e.bodyOwner, `${e.key}: a null builder must name its bodyOwner`);
    }
  }
});

Deno.test("entries with a builder declare their variables", () => {
  for (const e of WHATSAPP_CATALOGUE) {
    if (!e.build) continue;
    if (e.key === "warranty_auto") continue;
    assert(e.variables.length > 0, `${e.key}: builder with no declared variables`);
    for (const v of e.variables) {
      assert(v.name.length > 0, `${e.key}: unnamed variable`);
      assert(v.source.length > 0, `${e.key}.${v.name}: missing source`);
    }
  }
});

Deno.test("dynamic message types are flagged, static ones are single-valued", () => {
  for (const e of WHATSAPP_CATALOGUE) {
    if (e.messageTypes.length > 1) {
      assertEquals(e.dynamicMessageType, true, `${e.key}: multiple types must set dynamicMessageType`);
    }
  }
});

// ---------------------------------------------------------------------------
// Coverage: every send site in the repo is accounted for
// ---------------------------------------------------------------------------

Deno.test("every WhatsApp send site is in the catalogue or explicitly excluded", async () => {
  const marker = /360messenger|sendWhatsApp|buildWhatsAppPayload/;
  const found: string[] = [];
  for await (const dir of Deno.readDir(FUNCTIONS_DIR)) {
    if (!dir.isDirectory || dir.name.startsWith("_")) continue;
    let src: string;
    try {
      src = await Deno.readTextFile(new URL(`${dir.name}/index.ts`, FUNCTIONS_DIR));
    } catch {
      continue;
    }
    if (marker.test(src)) found.push(dir.name);
  }
  assert(found.length > 0, "no send sites found — the scan itself is broken");

  const accounted = new Set([...CATALOGUE_FUNCTIONS, ...CONFIG_ONLY_FUNCTIONS]);
  const unaccounted = found.filter((f) => !accounted.has(f)).sort();
  assertEquals(unaccounted, [], `unaccounted WhatsApp send sites: ${unaccounted.join(", ")}`);
});

Deno.test("catalogue functions all exist on disk", async () => {
  for (const fn of CATALOGUE_FUNCTIONS) {
    const stat = await Deno.stat(new URL(`${fn}/index.ts`, FUNCTIONS_DIR));
    assert(stat.isFile, `${fn}: index.ts missing`);
  }
});

Deno.test("notifyAdmin stays outside the tenant catalogue", () => {
  assert(EXCLUDED_SEND_PATHS.includes("_shared/notifyAdmin.ts"));
  for (const e of WHATSAPP_CATALOGUE) {
    for (const f of e.functions) {
      assert(!f.includes("notifyAdmin"), `${e.key}: notifyAdmin must not be a catalogue entry`);
    }
  }
});

Deno.test("message_log types are unique and sorted", () => {
  assertEquals([...CATALOGUE_MESSAGE_TYPES].sort(), CATALOGUE_MESSAGE_TYPES);
  assertEquals(new Set(CATALOGUE_MESSAGE_TYPES).size, CATALOGUE_MESSAGE_TYPES.length);
  // Spot-check the types operations filters message_log on most often.
  for (const t of ["appointment_reminder", "deposit_reminder", "receipt", "quote", "renewal_reminder"]) {
    assert(CATALOGUE_MESSAGE_TYPES.includes(t), `missing message_type ${t}`);
  }
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

Deno.test("builders are pure: same input, same output, no mutation of input", () => {
  for (const e of WHATSAPP_CATALOGUE) {
    if (!e.build) continue;
    const vars: Record<string, unknown> = {};
    for (const v of e.variables) vars[v.name] = `<${v.name}>`;
    vars.replyKind = "confirm";
    const snapshot = JSON.stringify(vars);
    const first = e.build(vars);
    const second = e.build(vars);
    assertEquals(first, second, `${e.key}: builder is not deterministic`);
    assertEquals(JSON.stringify(vars), snapshot, `${e.key}: builder mutated its input`);
    assert(typeof first === "string", `${e.key}: builder must return a string`);
  }
});

Deno.test("catalogue module performs no IO and reads no globals at import time", async () => {
  const src = await Deno.readTextFile(new URL("whatsappCatalogue.ts", import.meta.url));
  for (const banned of ["createClient", "Deno.env", "fetch(", "import ", "supabase"]) {
    assert(!src.includes(banned), `catalogue must not contain "${banned}"`);
  }
});

// ---------------------------------------------------------------------------
// Lookup behaviour
// ---------------------------------------------------------------------------

Deno.test("buildCatalogueMessage throws for unknown keys", () => {
  assertThrows(() => buildCatalogueMessage("nope", {}), Error, "Unknown WhatsApp catalogue key");
});

Deno.test("buildCatalogueMessage refuses externally-owned bodies instead of returning empty", () => {
  assertThrows(
    () => buildCatalogueMessage("review_request", {}),
    Error,
    "has no in-repo body",
  );
});

Deno.test("getCatalogueEntry returns undefined rather than throwing", () => {
  assertEquals(getCatalogueEntry("nope"), undefined);
  assertEquals(getCatalogueEntry("receipt")?.category, "Invoices & receipts");
});

// ---------------------------------------------------------------------------
// Money formatters — four are preserved deliberately (audit D5)
// ---------------------------------------------------------------------------

Deno.test("all four production money formatters are preserved verbatim", () => {
  assertEquals(fmtPlainEuro(1234.5), "€1234.50");
  assertEquals(fmtGroupedEuro(1234.5), "€1,234.50");
  assertEquals(fmtGroupedEuro(-1234.5), "€1,234.50"); // abs(), as in create-job-invoice
  assertEquals(fmtRoundedEuro(1234.505), "€1234.51");
  assertEquals(fmtReceiptAmount(null), "€0.00");
  assertEquals(fmtReceiptAmount(0), "€0.00");
  assertEquals(fmtReceiptAmount(99.9), "€99.90");
});

// ---------------------------------------------------------------------------
// Output equality against current production bodies (byte-for-byte)
// ---------------------------------------------------------------------------

Deno.test("booking_confirmation matches production output", () => {
  assertEquals(
    buildCatalogueMessage("booking_confirmation", {
      firstName: "Paula",
      companyName: "Dublin Gas",
      formattedDate: "Monday 01 September 2026",
      timeSlot: "9am-1pm",
      engineerName: "Paul",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, your booking with Dublin Gas is confirmed.\n\n" +
      "📅 Date: Monday 01 September 2026\n" +
      "⏰ Time: 9am-1pm\n" +
      "👷 Engineer: Paul\n\n" +
      "If you need to make any changes please reply to this message.\n\n" +
      "Dublin Gas",
  );
});

Deno.test("booking_confirmation degrades to the legacy 'us' fallback", () => {
  const out = buildCatalogueMessage("booking_confirmation", {
    firstName: "Paula",
    companyName: "",
    formattedDate: "TBC",
    timeSlot: "TBC",
    engineerName: "TBC",
    messageFooter: "",
  });
  assert(out.startsWith("Hi Paula, your booking with us is confirmed."));
  assert(out.endsWith("please reply to this message."), "footer line must be omitted when blank");
});

Deno.test("schedule_confirmation omits the with-phrase and sign-off when unconfigured", () => {
  const configured = buildCatalogueMessage("schedule_confirmation", {
    firstName: "Paula",
    companyName: "Dublin Gas",
    companyPhone: "015550000",
    scheduledDate: "01/09/26",
    timeSlot: "9am-1pm",
    engineerName: "Paul",
  });
  assert(configured.includes("your booking with Dublin Gas is confirmed."));
  assert(configured.endsWith("\n\nDublin Gas ☎ 015550000"));

  const bare = buildCatalogueMessage("schedule_confirmation", {
    firstName: "Paula",
    companyName: "",
    companyPhone: "",
    scheduledDate: "01/09/26",
    timeSlot: "9am-1pm",
    engineerName: "Paul",
  });
  assert(bare.includes("your booking is confirmed."));
  assert(bare.endsWith("please reply to this message."));
});

Deno.test("job_reminder_2day preserves the 'undefined' defect (F1) verbatim", () => {
  const out = buildCatalogueMessage("job_reminder_2day", {
    firstName: "Paula",
    companyName: undefined,
    companyPhone: undefined,
    formattedDate: "01/09/26",
    formattedTime: "9am-1pm",
    engineerName: "",
  });
  // Baseline behaviour, NOT desired behaviour — fixed as an explicit copy change.
  assert(out.includes("reminder from undefined that"), out);
  assert(out.includes("call us on undefined"), out);
  assert(!out.includes("Your engineer will be"), "engineer line must be omitted when blank");
});

Deno.test("quote_sent matches production output with all optional lines", () => {
  assertEquals(
    buildCatalogueMessage("quote_sent", {
      firstName: "Paula",
      job_description: "Boiler replacement",
      refNumber: "Q-1001",
      quote_amount: 2500,
      deposit: 1250,
      acceptUrl: "https://example.test/q/abc",
      quotePdfUrl: "https://example.test/q/abc.pdf",
      messageFooter: "Dublin Gas",
      business_phone: "015550000",
    }),
    "Hi Paula,\n\nHere is your quote for Boiler replacement.\n\n" +
      "Quote No: Q-1001\n\nTotal: €2500.00\n\n" +
      "Deposit to secure booking: €1250.00\n\n" +
      "To accept this quote, reply:\nYES Q-1001\n\n" +
      "View and approve here:\nhttps://example.test/q/abc\n\n" +
      "📄 View your full quote PDF:\nhttps://example.test/q/abc.pdf\n\n" +
      "Dublin Gas\n📞 015550000",
  );
});

Deno.test("quote_sent drops the deposit line when there is no deposit", () => {
  const out = buildCatalogueMessage("quote_sent", {
    firstName: "Paula",
    job_description: "Service",
    refNumber: "Q-1002",
    quote_amount: 120,
    deposit: 0,
    messageFooter: "Dublin Gas",
  });
  assert(!out.includes("Deposit to secure booking"));
  assert(!out.includes("View and approve here"));
  assert(out.endsWith("Dublin Gas"));
});

Deno.test("quote follow-ups match production output at both stages", () => {
  assertEquals(
    buildCatalogueMessage("quote_followup_day3", {
      customerName: "Paula White",
      quoteNumber: "Q-1001",
      quoteUrl: "https://example.test/q/abc",
      businessName: "Dublin Gas",
    }),
    "Hi Paula, just checking you got quote Q-1001 we sent over. " +
      "Happy to answer any questions or adjust anything if needed." +
      "\n\nView your quote here: https://example.test/q/abc" +
      "\n\nThanks,\nDublin Gas",
  );

  assertEquals(
    buildCatalogueMessage("quote_followup_day6", {
      customerName: "Paula White",
      quoteNumber: "",
      quoteUrl: "",
      businessName: "",
      businessPhone: "",
    }),
    "Hi Paula, we wanted to follow up on the quote we sent over. " +
      "We have some availability coming up if you'd like to go ahead. " +
      "Reply to this message if you have any questions." +
      "\n\nThanks,\nour team",
  );
});

Deno.test("quote_accepted_alert and accept_quote_customer are byte-identical (D7)", () => {
  const vars = {
    customerName: "Paula White",
    quoteRef: "Q-1001",
    totalAmount: "2500.00",
    depositAmount: "1250.00",
  };
  const withoutFooter = buildCatalogueMessage("quote_accepted_alert", vars);
  assertEquals(withoutFooter, buildCatalogueMessage("accept_quote_customer", vars));
  assertEquals(
    withoutFooter,
    "✅ Quote Accepted\n\nCustomer: Paula White\nQuote: Q-1001\nTotal: €2500.00\nDeposit: €1250.00\n\n" +
      "Job has been created — open BookedJobs to schedule.",
  );
  assert(
    buildCatalogueMessage("quote_accepted_alert", { ...vars, messageFooter: "Dublin Gas" })
      .endsWith("\n\nDublin Gas"),
  );
});

Deno.test("deposit_link matches production output", () => {
  assertEquals(
    buildCatalogueMessage("deposit_link", {
      customerName: "Paula",
      companyName: "Dublin Gas",
      companyPhone: "015550000",
      depositAmount: 1250,
      paymentLink: "https://pay.test/abc",
    }),
    "Hi Paula,\n\nThank you for approving your quote with Dublin Gas.\n\n" +
      "To confirm your booking and secure the parts for your job, a 50% deposit of €1250.00 is required.\n\n" +
      "Pay securely here: https://pay.test/abc\n\n" +
      "If you have any questions please reply to this message.\n\n" +
      "Dublin Gas ☎ 015550000",
  );
});

Deno.test("deposit_reminder matches production output", () => {
  assertEquals(
    buildCatalogueMessage("deposit_reminder", {
      customerName: "Paula",
      companyName: "Dublin Gas",
      companyPhone: "015550000",
      paymentLink: "https://pay.test/abc",
    }),
    "Hi Paula, this is a reminder that your deposit payment is still outstanding for your booking with Dublin Gas.\n\n" +
      "Please pay securely here: https://pay.test/abc\n\n" +
      "If you have any questions please reply to this message.\n\n" +
      "Dublin Gas ☎ 015550000",
  );
});

Deno.test("payment_link matches production output including optional PDF line", () => {
  assertEquals(
    buildCatalogueMessage("payment_link", {
      customerName: "Paula",
      jobType: "Boiler Service",
      jobTotal: 180,
      depositAmount: 0,
      balanceDue: 180,
      invoiceNumber: "INV-2001",
      invoicePdfUrl: "https://example.test/inv.pdf",
      paymentLink: "https://pay.test/abc",
      footer: "Dublin Gas",
    }),
    "Hi Paula, please find your invoice attached for Boiler Service.\n\n" +
      "Total: €180.00\n\nDeposit paid: €0.00\n\nBalance due: €180.00\n\n" +
      "Invoice ref: INV-2001\n\nPayment due within 14 days.\n\n" +
      "📄 View invoice:\nhttps://example.test/inv.pdf\n\n" +
      "💳 Pay now:\nhttps://pay.test/abc\n\n" +
      "Thank you, Dublin Gas",
  );
});

Deno.test("invoice_created keeps the comma-grouped formatter and single newlines", () => {
  assertEquals(
    buildCatalogueMessage("invoice_created", {
      firstName: "Paula",
      jobType: "Boiler replacement",
      total: 2500,
      depositPaid: 1250,
      balance: 1250,
      invNum: "INV-2002",
      invoiceUrl: "https://example.test/i/abc",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, please find your invoice attached for Boiler replacement.\n\n" +
      "Total: €2,500.00\nDeposit paid: €1,250.00\nBalance due: €1,250.00\n\n" +
      "Invoice ref: INV-2002\nPayment due within 14 days.\n\n" +
      "📄 View invoice:\nhttps://example.test/i/abc\n\n" +
      "Thank you, Dublin Gas",
  );
});

Deno.test("invoice_sent matches production output", () => {
  assertEquals(
    buildCatalogueMessage("invoice_sent", {
      customerName: "Paula",
      businessName: "Dublin Gas",
      businessPhone: "015550000",
      jobRef: "DG-0042",
      invoiceNumber: "INV-2003",
      invoiceDate: "01/09/2026",
      balanceDue: "€180.00",
      paymentLink: "https://pay.test/abc",
    }),
    "Hi Paula, please find your invoice from Dublin Gas.\n\n" +
      "Job Ref: DG-0042\nInvoice #: INV-2003\nInvoice Date: 01/09/2026\nBalance Due: €180.00\n\n" +
      "Pay securely here: https://pay.test/abc\n\n" +
      "If you have any questions please reply to this message.\n\n" +
      "Dublin Gas\n☎️ 015550000",
  );
});

Deno.test("outstanding_invoice matches production output", () => {
  assertEquals(
    buildCatalogueMessage("outstanding_invoice", {
      firstName: "Paula",
      businessName: "Dublin Gas",
      businessPhone: "015550000",
      balance: "180.00",
      invoiceDate: "01/09/2026",
      stripeLink: "https://pay.test/abc",
    }),
    "Hi Paula, this is a friendly reminder from Dublin Gas that you have an outstanding balance of €180.00 for work completed on 01/09/2026.\n\n" +
      "Pay securely here: https://pay.test/abc\n\n" +
      "If you have already made payment please ignore this message. Any questions reply to this message.\n\n" +
      "Dublin Gas ☎️ 015550000",
  );
});

Deno.test("payment_received preserves the hardcoded KN- prefix defect (F2)", () => {
  const out = buildCatalogueMessage("payment_received", {
    customerName: "Paula",
    jobRef: "KN-abcdef12", // baseline: prefix is applied by the function, not the tenant
    invoiceNumber: "RCP-3001",
    jobType: "Boiler Service",
    scheduledDate: "01/09/2026",
    amountPaid: "€180.00",
    receiptUrl: "https://example.test/r/abc",
    companyName: "Dublin Gas",
  });
  assertEquals(
    out,
    "Hi Paula, thanks for your payment. Here is your receipt:\n\n" +
      "Job Ref: KN-abcdef12\nReceipt: RCP-3001\nService: Boiler Service\nDate: 01/09/2026\nAmount Paid: €180.00\n\n" +
      "View your receipt here: https://example.test/r/abc\n\n" +
      "Thanks,\nDublin Gas",
  );
});

Deno.test("receipt matches production output and drops optional lines", () => {
  assertEquals(
    buildCatalogueMessage("receipt", {
      customerName: "Paula",
      jobRef: "DG-0042",
      receiptNum: "RCP-3002",
      jobType: "Boiler Service",
      date: "01 September 2026",
      amount: "€180.00",
      paymentMethod: "Card",
      receiptUrl: "https://example.test/r/abc",
      footer: "Dublin Gas",
    }),
    "Hi Paula, thanks for your payment. Here's your receipt:\n\n" +
      "Job Ref: DG-0042\nReceipt: RCP-3002\nService: Boiler Service\nDate: 01 September 2026\n" +
      "Amount Paid: €180.00 (Card)\n\n" +
      "📄 View your receipt here: https://example.test/r/abc\n\n" +
      "Thanks,\nDublin Gas",
  );

  const bare = buildCatalogueMessage("receipt", {
    customerName: "Paula",
    jobRef: "DG-0042",
    receiptNum: "",
    jobType: "",
    date: "01 September 2026",
    amount: "€0.00",
    paymentMethod: "Invoice",
    receiptUrl: "",
    footer: "Dublin Gas",
  });
  assert(!bare.includes("Receipt:"));
  assert(bare.includes("Service: Boiler Service"), "job type falls back to Boiler Service");
  assert(!bare.includes("View your receipt here"));
});

Deno.test("sumup_payment_confirmed matches production output", () => {
  assertEquals(
    buildCatalogueMessage("sumup_payment_confirmed", {
      customerName: "Paula",
      jobReference: "DG-0042",
      amountPaid: 100,
      balanceRemaining: 80,
      receiptUrl: "https://example.test/r/abc",
      footer: "Dublin Gas",
    }),
    "Hi Paula, thanks for your payment.\n\n" +
      "Job Ref: DG-0042\n\n" +
      "Amount paid: €100.00 (Card)\n" +
      "Balance remaining: €80.00\n\n" +
      "This is a part payment, so your job is not fully paid yet — the balance above is still due. " +
      "Your full receipt follows once the job is settled in full.\n\n" +
      "Payment record: https://example.test/r/abc\n\n" +
      "Thanks,\nDublin Gas",
  );
});

Deno.test("sumup_payment_confirmed falls back to 'there' and omits blank blocks", () => {
  const out = buildCatalogueMessage("sumup_payment_confirmed", {
    customerName: "   ",
    jobReference: "",
    amountPaid: 50,
    balanceRemaining: 25,
    receiptUrl: "",
    footer: "",
    businessName: "",
  });
  assert(out.startsWith("Hi there, thanks for your payment."));
  assert(!out.includes("Job Ref:"));
  assert(!out.includes("Payment record:"));
  assert(!out.includes("Thanks,"));
});

Deno.test("extra_work_payment matches production output", () => {
  assertEquals(
    buildCatalogueMessage("extra_work_payment", {
      customerName: "Paula",
      companyName: "Dublin Gas",
      companyPhone: "015550000",
      itemsSummary: "- Pump replacement: €220.00\n",
      amount: 220,
      paymentLink: "https://pay.test/abc",
    }),
    "Hi Paula,\n\nYour engineer has identified some additional work required during your service today with Dublin Gas.\n\n" +
      "Additional work:\n- Pump replacement: €220.00\n\n" +
      "Amount due: €220.00\n\n" +
      "To approve and pay securely tap here:\nhttps://pay.test/abc\n\n" +
      "If you have any questions please call us on 015550000.\n\n" +
      "Dublin Gas ☎ 015550000",
  );
});

Deno.test("certificate matches production output", () => {
  assertEquals(
    buildCatalogueMessage("certificate", {
      customerName: "Paula",
      certTypeLabel: "Gas Installation Declaration of Conformance",
      certificateNumber: "DGC-0001",
      certificateUrl: "https://example.test/c/abc",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, please find your Gas Installation Declaration of Conformance DGC-0001.\n\n" +
      "This certificate confirms all work has been completed in accordance with Irish gas safety standards.\n\n" +
      "Please keep this for your records.\n\n" +
      "Thank you for choosing us. 🔧\n\n" +
      "📄 View Certificate:\nhttps://example.test/c/abc\n\n" +
      "Dublin Gas",
  );
});

Deno.test("hazard_notification matches production output", () => {
  assertEquals(
    buildCatalogueMessage("hazard_notification", {
      firstName: "Paula",
      engineerName: "Paul",
      hazardUrl: "https://example.test/h/abc",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, please find attached your Gas Installation Notification of Hazard/Non-Conformance from Paul.\n\n" +
      "📄 View Document:\nhttps://example.test/h/abc\n\n" +
      "Dublin Gas",
  );
});

Deno.test("part_arrived uses the default body or the caller override", () => {
  assertEquals(
    buildCatalogueMessage("part_arrived", {
      firstName: "Paula",
      follow_up_detail: "Fit replacement fan",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, great news! The part we ordered for your boiler has arrived. 🔧\n\n" +
      "We'd like to arrange a time to come back and complete the work.\n\n" +
      "Details: Fit replacement fan\n\n" +
      "Please reply to this message or call us to book a time that suits you.\n\n" +
      "Dublin Gas",
  );
  assertEquals(
    buildCatalogueMessage("part_arrived", {
      firstName: "Paula",
      customMessage: "Your part is in, call us.",
      messageFooter: "",
    }),
    "Your part is in, call us.",
  );
});

Deno.test("renewal_reminder matches production output with and without a Tally URL", () => {
  assertEquals(
    buildCatalogueMessage("renewal_reminder", {
      first_name: "Paula",
      renewal_date: "01/09/26",
      companyName: "Dublin Gas",
      companyPhone: "015550000",
      renewalFormUrl: "https://tally.test/form",
      cleanPhone: "353871234567",
    }),
    "Hi Paula,\n\nThis is Dublin Gas. Your annual boiler service is due on 01/09/26.\n\n" +
      "If your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.\n\n" +
      "Book online: https://tally.test/form?customer_phone=353871234567\n\n" +
      "Or reply here or call us on 015550000.\n\n" +
      "Reply STOP to unsubscribe.\nDublin Gas",
  );

  const noTally = buildCatalogueMessage("renewal_reminder", {
    first_name: "Paula",
    renewal_date: "01/09/26",
    companyName: "Dublin Gas",
    companyPhone: "015550000",
    renewalFormUrl: "",
    cleanPhone: "353871234567",
  });
  assert(!noTally.includes("Book online"), "no cross-tenant URL fallback is permitted");
  assert(noTally.includes("Reply here to book your service or call us on 015550000."));
});

Deno.test("area_bulk_renewal differs from renewal_reminder by exactly the known wording drift", () => {
  const bulk = buildCatalogueMessage("area_bulk_renewal", {
    firstName: "Paula",
    companyName: "Dublin Gas",
    companyPhone: "015550000",
    dueDate: "01/09/26",
  });
  assert(bulk.includes("is generally a condition of keeping that warranty valid"));
  assert(bulk.endsWith("Reply STOP to unsubscribe.\nDublin Gas"));
});

Deno.test("warranty messages match production output and keep the Gas Safe wording (F3)", () => {
  const day14 = buildCatalogueMessage("warranty_day14", {
    first_name: "Paula",
    boiler_brand: "Ideal",
    boiler_model: "Logic Max",
    install_date_formatted: "01/03/26",
    brandingName: "Dublin Gas",
    brandingPhone: "015550000",
    footerLine: "Dublin Gas",
    tallyUrl: "https://tally.test/form",
  });
  assertEquals(
    day14,
    "Hi Paula, this is Dublin Gas.\n\n" +
      "We are getting in touch to let you know your Ideal Logic Max boiler, installed on 01/03/26, is currently covered under the manufacturer's warranty.\n\n" +
      "⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\n" +
      "Book your annual service here:\n👉 https://tally.test/form\n\n" +
      "Or call us on 📞 015550000\n\n" +
      "Dublin Gas",
  );

  const day28 = buildCatalogueMessage("warranty_day28", {
    first_name: "Paula",
    boiler_brand: "Ideal",
    boiler_model: "Logic Max",
    brandingName: "Dublin Gas",
    brandingPhone: "",
    footerLine: "Dublin Gas",
    tallyUrl: "https://tally.test/form",
  });
  assert(day28.includes("We messaged you two weeks ago"));
  assert(!day28.includes("Or call us on"), "phone line must be omitted when unconfigured");
});

Deno.test("inbound auto-replies match production output for all five kinds", () => {
  const base = {
    brandingName: "Dublin Gas",
    brandingPhone: "015550000",
    brandingFooter: "Dublin Gas",
    jobOwnerName: "Paula",
  };
  const reply = (replyKind: string) => buildCatalogueMessage("inbound_reply", { ...base, replyKind });

  assertEquals(
    reply("opt_out"),
    "Got it — we've removed you from our reminder list. No further messages will be sent. Dublin Gas.",
  );
  assertEquals(
    reply("unmatched"),
    "Thanks — we couldn't match that to an upcoming appointment. Please call us on 015550000 and we'll help.",
  );
  assertEquals(
    reply("ambiguous"),
    "Thanks — you have more than one upcoming appointment with us, so we don't want to change the wrong one. " +
      "Please call us on 015550000 and we'll sort it straight away.",
  );
  assertEquals(reply("confirm"), "Thanks Paula, your appointment is confirmed. See you then! Dublin Gas");
  assertEquals(
    reply("cancel"),
    "Thanks Paula, your appointment has been cancelled. To rebook please call us on 015550000. Dublin Gas",
  );
  assertEquals(reply("inbound"), "", "the stored inbound customer text has no builder");

  const noPhone = buildCatalogueMessage("inbound_reply", {
    ...base,
    brandingPhone: "",
    replyKind: "unmatched",
  });
  assert(noPhone.includes("Please call us and we'll help."));
});

Deno.test("cancellation and cancel_job_notify match production output", () => {
  assertEquals(
    buildCatalogueMessage("cancellation", {
      firstName: "Paula",
      brandingName: "Dublin Gas",
      brandingPhone: "015550000",
      brandingFooter: "Dublin Gas",
      cancellationReason: "Customer request",
    }),
    "Hi Paula, your booking with Dublin Gas has been cancelled.\n\n" +
      "Reason: Customer request\n\n" +
      "To rebook please call us on 015550000.\n\n" +
      "Dublin Gas",
  );
  assertEquals(
    buildCatalogueMessage("cancel_job_notify", {
      firstName: "Paula",
      brandingName: "Dublin Gas",
      brandingPhone: "015550000",
      cancellation_reason: "Customer request",
    }),
    "Hi Paula, your booking with Dublin Gas has been cancelled. Reason: Customer request. " +
      "To rebook please call us on 015550000.",
  );
});

Deno.test("appointment_reminder repeats the footer top and bottom", () => {
  const out = buildCatalogueMessage("appointment_reminder", {
    messageFooter: "Dublin Gas",
    firstName: "Paula",
    jobType: "Boiler Service",
    targetStr: "Monday 01 September",
    timeSlot: "9am-1pm",
    engineerName: "Paul",
  });
  assertEquals(
    out,
    "Appointment Reminder 📅\nDublin Gas\n\n" +
      "Hi Paula, just a reminder that your Boiler Service is booked for Monday 01 September between 9am-1pm.\n\n" +
      "Your engineer Paul will be with you on the day. If you need to reschedule, please give us a call.\n\n" +
      "Thanks,\nDublin Gas",
  );
});

Deno.test("reschedule_notification matches production output", () => {
  assertEquals(
    buildCatalogueMessage("reschedule_notification", {
      firstName: "Paula",
      newDate: "03/09/26",
      timeSlot: "9am-1pm",
      messageFooter: "Dublin Gas",
    }),
    "Hi Paula, your appointment has been rescheduled to 03/09/26 at 9am-1pm. Apologies for any inconvenience — Dublin Gas",
  );
});
