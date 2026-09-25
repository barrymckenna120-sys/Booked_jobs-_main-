import { assertEquals } from "jsr:@std/assert@1";
import { readInboundPayload } from "./inboundPayload.ts";

Deno.test("reads current nested 360Messenger layout (25/09/26 STOP)", () => {
  const r = readInboundPayload({
    event: "message",
    createdAt: "2026-09-25 15:41:25",
    serviceId: 13029,
    data: { from: "212656802656", to: "353872354257", type: "chat", body: "stop" },
  });
  assertEquals(r.eventType, "message");
  assertEquals(r.from, "212656802656");
  assertEquals(r.text, "stop");
  assertEquals(r.createdAt, "2026-09-25 15:41:25");
});

Deno.test("still reads legacy flat layout", () => {
  const r = readInboundPayload({ dataType: "message", From: "353871234567", Chat: "STOP", createdAt: "x" });
  assertEquals(r.eventType, "message");
  assertEquals(r.from, "353871234567");
  assertEquals(r.text, "STOP");
});

Deno.test("non-message event stays non-message", () => {
  assertEquals(readInboundPayload({ event: "status" }).eventType, "status");
});
