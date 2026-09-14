import { describe, expect, it } from "vitest";
import {
  findSharedIntegrationValues,
  sharedIntegrationMessage,
} from "./integrationOwnership";

const rows = [
  {
    organisation_id: "org-old",
    integration_type: "tally",
    config: {
      webhook_secret: "shared-secret",
      new_booking_url: "https://book.example.ie/",
    },
  },
];

describe("findSharedIntegrationValues", () => {
  it("flags a booking form URL already used by another tenant", () => {
    const conflicts = findSharedIntegrationValues(rows, "org-new", {
      tally: { new_booking_url: "https://book.example.ie/" },
    });
    expect(conflicts).toEqual([
      { integrationType: "tally", key: "new_booking_url", organisationId: "org-old" },
    ]);
  });

  it("flags a webhook secret already used by another tenant", () => {
    const conflicts = findSharedIntegrationValues(rows, "org-new", {
      tally: { webhook_secret: "shared-secret" },
    });
    expect(conflicts).toHaveLength(1);
  });

  it("allows a tenant to re-save its own values", () => {
    expect(
      findSharedIntegrationValues(rows, "org-old", {
        tally: { webhook_secret: "shared-secret" },
      }),
    ).toEqual([]);
  });

  it("ignores blank values and other integration types", () => {
    expect(
      findSharedIntegrationValues(rows, "org-new", {
        tally: { webhook_secret: "  " },
        stripe: { webhook_secret: "shared-secret" },
      }),
    ).toEqual([]);
  });

  it("names the owning company in the message", () => {
    const conflicts = findSharedIntegrationValues(rows, "org-new", {
      tally: { new_booking_url: "https://book.example.ie/" },
    });
    expect(sharedIntegrationMessage(conflicts, () => "K&N Gas Services")).toContain(
      "K&N Gas Services",
    );
  });
});
