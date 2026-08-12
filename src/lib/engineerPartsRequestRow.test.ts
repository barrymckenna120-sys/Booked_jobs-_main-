import { describe, it, expect } from "vitest";
import { buildPartsRequestRow } from "./partsStatus";

/**
 * Engineer standalone (job-less) "Request Part" payload.
 *
 * public.parts_requests has a BEFORE INSERT/UPDATE trigger
 * (validate_parts_request_customer) that rejects rows where customer_id is null
 * AND customer_name is blank. These tests assert the builder always produces a
 * row that satisfies it for both engineer paths.
 */
const ORG = "8c37827f-ce2c-4507-a821-a5e807d89856";
const ENGINEER_USER = "574c0743-d9f4-4b7e-a1c5-0c5768cff881";
const CUSTOMER = "7380540d-5875-42ae-b765-da3a63493542";

const engineerRequest = (over: Record<string, unknown> = {}) =>
  buildPartsRequestRow({
    part: { description: "Thermocouple", priority: "normal", quantity: 1 },
    organisationId: ORG,
    serviceCallId: null,
    customerId: null,
    customerName: null,
    loggedBy: ENGINEER_USER,
    loggedByName: "Barry",
    assignedTo: null,
    ...over,
  } as any);

/** Mirrors the DB trigger condition. */
const satisfiesCustomerTrigger = (row: any) =>
  row.customer_id !== null || (typeof row.customer_name === "string" && row.customer_name.trim() !== "");

describe("engineer job-less parts request payload", () => {
  it("picked customer -> customer_id set, customer_name null", () => {
    const row = engineerRequest({ customerId: CUSTOMER, customerName: null })!;
    expect(row.customer_id).toBe(CUSTOMER);
    expect(row.customer_name).toBeNull();
    expect(row.service_call_id).toBeNull();
    expect(row.status).toBe("Open");
    expect(satisfiesCustomerTrigger(row)).toBe(true);
  });

  it("typed name -> customer_name set, customer_id null", () => {
    const row = engineerRequest({ customerId: null, customerName: "Phoned-in Mary" })!;
    expect(row.customer_id).toBeNull();
    expect(row.customer_name).toBe("Phoned-in Mary");
    expect(satisfiesCustomerTrigger(row)).toBe(true);
  });

  it("no customer at all would violate the trigger condition", () => {
    const row = engineerRequest()!;
    expect(satisfiesCustomerTrigger(row)).toBe(false);
  });
});
