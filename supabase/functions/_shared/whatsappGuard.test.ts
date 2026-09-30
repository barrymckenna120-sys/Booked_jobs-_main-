import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendWhatsAppGuarded, SUPPRESSED_TEST_MODE } from "./whatsapp.ts";
import { WHATSAPP_SEND_URL } from "./whatsappPayload.ts";

const ORG = "c0aa41ac-41ab-42d8-8085-972c072b0279";
Deno.env.set("SUPABASE_URL", "https://example.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");

type Call = { url: string; method: string; body?: unknown };

function mockFetch(opts: { testMode: boolean | null; allowed?: string[]; orgRows?: number }) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (url.includes("/rest/v1/organisations?")) {
      const n = opts.orgRows ?? 1;
      return new Response(JSON.stringify(Array.from({ length: n }, () => ({ whatsapp_test_mode: opts.testMode }))));
    }
    if (url.includes("organisation_whatsapp_allowed_numbers")) {
      assert(url.includes(`organisation_id=eq.${ORG}`), "allow-list must be scoped to the same org");
      return new Response(JSON.stringify((opts.allowed ?? []).map((phone) => ({ phone }))));
    }
    if (url.includes("/rest/v1/message_log")) return new Response("", { status: 201 });
    if (url === WHATSAPP_SEND_URL) return new Response(JSON.stringify({ ok: true }));
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  return { f, calls };
}

function form(phone: string) {
  const fd = new FormData();
  fd.append("phonenumber", phone);
  fd.append("text", "hello");
  return fd;
}
const sends = (c: Call[]) => c.filter((x) => x.url === WHATSAPP_SEND_URL);

Deno.test("LIVE org sends, with recipient normalised to 353 digits", async () => {
  const { f, calls } = mockFetch({ testMode: false });
  const body = form("087 123 4567");
  const r = await sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body, messageType: "t", fetchImpl: f });
  assertEquals(r.status, "sent");
  assertEquals(sends(calls).length, 1);
  assertEquals(body.get("phonenumber"), "353871234567");
});

for (const fmt of ["0871234567", "871234567", "+353871234567", "00353871234567"]) {
  Deno.test(`TEST org + allowed number in format ${fmt} sends`, async () => {
    const { f, calls } = mockFetch({ testMode: true, allowed: ["+353 87 123 4567"] });
    const r = await sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body: form(fmt), messageType: "t", fetchImpl: f });
    assertEquals(r.status, "sent");
    assertEquals(sends(calls).length, 1);
  });
}

Deno.test("TEST org + unapproved number is suppressed, logged, never sent", async () => {
  const { f, calls } = mockFetch({ testMode: true, allowed: ["0870000000"] });
  const r = await sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body: form("0871234567"), messageType: "renewal_reminder", fetchImpl: f });
  assertEquals(r.status, "suppressed");
  assertEquals(sends(calls).length, 0);
  const log = calls.find((c) => c.url.endsWith("/rest/v1/message_log") && c.method === "POST");
  assert(log, "suppression must write a message_log row");
  assertEquals(JSON.parse(String(log!.body)).status, SUPPRESSED_TEST_MODE);
});

Deno.test("existing pending log row is marked suppressed instead of inserting a new one", async () => {
  const { f, calls } = mockFetch({ testMode: true });
  await sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body: form("0871234567"), messageType: "t", existingLogId: "abc", fetchImpl: f });
  assert(calls.some((c) => c.method === "PATCH" && c.url.includes("message_log?id=eq.abc")));
  assert(!calls.some((c) => c.method === "POST" && c.url.endsWith("/rest/v1/message_log")));
});

Deno.test("fails closed: missing / non-uuid / 'platform' organisation id", async () => {
  const { f, calls } = mockFetch({ testMode: false });
  for (const id of ["", "platform"]) {
    await assertRejects(() => sendWhatsAppGuarded({ organisationId: id, apiKey: "k", body: form("0871234567"), messageType: "t", fetchImpl: f }));
  }
  assertEquals(sends(calls).length, 0);
});

Deno.test("fails closed: unknown organisation", async () => {
  const { f, calls } = mockFetch({ testMode: false, orgRows: 0 });
  await assertRejects(() => sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body: form("0871234567"), messageType: "t", fetchImpl: f }));
  assertEquals(sends(calls).length, 0);
});

Deno.test("fails closed: invalid recipient number", async () => {
  const { f, calls } = mockFetch({ testMode: false });
  await assertRejects(() => sendWhatsAppGuarded({ organisationId: ORG, apiKey: "k", body: form("abc"), messageType: "t", fetchImpl: f }));
  assertEquals(sends(calls).length, 0);
});

// ---- Caller contract: sent markers only move on status === "sent" ----------

const read = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url));

Deno.test("suppressed renewal reminder returns before any sent marker is written", () => {
  const src = read("../send-renewal-reminder/index.ts");
  const suppressedAt = src.indexOf('guarded.status === "suppressed"');
  const markerAt = src.indexOf("last_reminder_sent");
  const flagAt = src.indexOf("reminder_30_days_sent: true");
  assert(suppressedAt > 0, "renewal must check for suppression");
  assert(suppressedAt < markerAt && suppressedAt < flagAt, "suppression exit must precede marker writes");
  const block = src.slice(suppressedAt, src.indexOf("const response = guarded.response", suppressedAt));
  assert(block.includes("return"), "suppressed branch must return without touching markers");
  assert(!/last_reminder_sent|reminder_30_days_sent|status: "sent"/.test(block));
});

const PAYMENT_FILES = [
  "../send-payment-link/index.ts",
  "../send-payment-received/index.ts",
  "../send-whatsapp-receipt/index.ts",
  "../send-deposit-reminder/index.ts",
  "../send-extrawork-payment-link/index.ts",
  "../send-outstanding-invoice-reminders/index.ts",
  "../send-invoice-whatsapp/index.ts",
  "../create-job-invoice/index.ts",
  "../sumup-payment-webhook/index.ts",
  "./depositLink.ts",
];
for (const p of PAYMENT_FILES) {
  Deno.test(`payment sender ${p}: guarded send, suppression checked, no direct 360 call`, () => {
    const src = read(p);
    assert(src.includes("sendWhatsAppGuarded("), "must use the shared guarded send");
    assert(src.includes('"suppressed"'), "must branch on the suppressed status");
    assert(!src.includes("api.360messenger.com"), "must not call 360Messenger directly");
  });
}

Deno.test("only whatsapp.ts, the inbound-reply handler, and the URL constant reference the 360 send endpoint", () => {
  const offenders: string[] = [];
  const root = new URL("../", import.meta.url);
  for (const dir of Deno.readDirSync(root)) {
    if (!dir.isDirectory) continue;
    for (const f of Deno.readDirSync(new URL(dir.name + "/", root))) {
      if (!f.name.endsWith(".ts") || f.name.endsWith(".test.ts")) continue;
      const src = Deno.readTextFileSync(new URL(`${dir.name}/${f.name}`, root));
      if (src.includes("api.360messenger.com/v2/sendMessage") || /fetch\(\s*WHATSAPP_SEND_URL/.test(src)) {
        offenders.push(`${dir.name}/${f.name}`);
      }
    }
  }
  assertEquals(offenders.sort(), ["_shared/whatsapp.ts", "_shared/whatsappPayload.ts", "whatsapp-inbound/index.ts"].sort());
});
