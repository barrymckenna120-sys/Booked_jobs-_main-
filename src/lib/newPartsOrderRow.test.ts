import { describe, it, expect } from "vitest";
import { buildPartsRequestRow } from "./partsStatus";

/**
 * Payload shape for the office New Order form (NewPartsOrderSheet).
 *
 * The form's contract: engineers are referenced through assigned_to
 * (engineers.id) only. engineer_id and assigned_engineer_id must stay null —
 * both are profiles.user_id-based and the notification trigger resolves the
 * login from assigned_to for this path.
 */
const ORG = "8c37827f-ce2c-4507-a821-a5e807d89856";
const OFFICE_USER = "574c0743-d9f4-4b7e-a1c5-0c5768cff881";
const ENGINEER_ROW_ID = "55b9ba7b-4cfe-4f4f-8edb-7cc78e14dd2e";

/** Mirrors exactly how NewPartsOrderSheet calls the builder. */
const officeOrder = (over: Record<string, unknown> = {}) =>
  buildPartsRequestRow({
    part: { description: "Thermostat", priority: "normal", quantity: 1 },
    organisationId: ORG,
    serviceCallId: null,
    customerId: null,
    customerName: null,
    customerPhone: null,
    customerAddress: null,
    loggedBy: OFFICE_USER,
    loggedByName: "nicole",
    assignedTo: null,
    engineerId: null,
    ...over,
  } as any);

describe("New Order form payload", () => {
  it("job-linked submission keeps the job and customer references", () => {
    const row = officeOrder({
      serviceCallId: "3c7dfd04-27ae-4977-b3b8-88bd3c896b4f",
      customerId: "7380540d-5875-42ae-b765-da3a63493542",
    })!;
    expect(row.service_call_id).toBe("3c7dfd04-27ae-4977-b3b8-88bd3c896b4f");
    expect(row.customer_id).toBe("7380540d-5875-42ae-b765-da3a63493542");
    // Snapshot fields are suppressed when a real customer is linked.
    expect(row.customer_name).toBeNull();
    expect(row.status).toBe("Open");
  });

  it("manual entry keeps the typed customer snapshot and no ids", () => {
    const row = officeOrder({
      customerId: null,
      customerName: "Phoned-in Mary",
      customerPhone: "+353871234567",
      customerAddress: "12 Main St",
    })!;
    expect(row.customer_id).toBeNull();
    expect(row.customer_name).toBe("Phoned-in Mary");
    expect(row.customer_phone).toBe("+353871234567");
    expect(row.customer_address).toBe("12 Main St");
    expect(row.service_call_id).toBeNull();
  });

  it("engineer assigned -> assigned_to holds the engineers.id", () => {
    const row = officeOrder({ assignedTo: ENGINEER_ROW_ID })!;
    expect(row.assigned_to).toBe(ENGINEER_ROW_ID);
  });

  it("unassigned -> assigned_to is null", () => {
    const row = officeOrder({ assignedTo: null })!;
    expect(row.assigned_to).toBeNull();
  });

  it("never sets engineer_id or assigned_engineer_id, in any case", () => {
    const cases = [
      officeOrder()!,
      officeOrder({ assignedTo: ENGINEER_ROW_ID })!,
      officeOrder({ serviceCallId: "3c7dfd04-27ae-4977-b3b8-88bd3c896b4f" })!,
      officeOrder({ customerName: "Phoned-in Mary" })!,
    ];
    for (const row of cases) {
      expect(row.engineer_id).toBeNull();
      expect((row as any).assigned_engineer_id).toBeUndefined();
    }
  });

  it("coerces quantity and passes priority through", () => {
    expect(officeOrder({ part: { description: "Pump", priority: "urgent", quantity: 0 } })!.quantity).toBe(1);
    expect(officeOrder({ part: { description: "Pump", priority: "urgent", quantity: -3 } })!.quantity).toBe(1);
    expect(officeOrder({ part: { description: "Pump", priority: "normal", quantity: NaN } })!.quantity).toBe(1);
    expect(officeOrder({ part: { description: "Pump", priority: "normal", quantity: 2.7 } })!.quantity).toBe(2);
    expect(officeOrder({ part: { description: "Pump", priority: "normal", quantity: 4 } })!.quantity).toBe(4);
    expect(officeOrder({ part: { description: "Pump", priority: "urgent", quantity: 1 } })!.priority).toBe("urgent");
  });

  it("returns null for a blank description", () => {
    expect(officeOrder({ part: { description: "   ", priority: "normal", quantity: 1 } })).toBeNull();
  });
});
