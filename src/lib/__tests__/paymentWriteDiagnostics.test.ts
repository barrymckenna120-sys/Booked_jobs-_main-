import { describe, it, expect } from "vitest";
import { RequestTimeoutError } from "@/lib/queryDefaults";
import {
  isTransientWriteError,
  writeFailureToastCopy,
} from "@/lib/paymentWriteDiagnostics";

describe("isTransientWriteError", () => {
  it("treats a request timeout as transient", () => {
    expect(isTransientWriteError(new RequestTimeoutError())).toBe(true);
  });

  it("treats fetch/network failures as transient", () => {
    expect(isTransientWriteError({ message: "Failed to fetch" })).toBe(true);
    expect(isTransientWriteError({ message: "Load failed" })).toBe(true);
  });

  it("does not treat a database error as transient", () => {
    expect(
      isTransientWriteError({ code: "23514", message: "violates check constraint" })
    ).toBe(false);
  });
});

describe("writeFailureToastCopy", () => {
  it("keeps the offline wording for genuine connectivity failures", () => {
    expect(writeFailureToastCopy(new RequestTimeoutError()).title).toBe(
      "No connection"
    );
  });

  it("surfaces the real error instead of claiming no connection", () => {
    const copy = writeFailureToastCopy({
      code: "23514",
      message: "violates check constraint",
    });
    expect(copy.title).toBe("Couldn't save this update");
    expect(copy.description).toContain("violates check constraint");
    expect(copy.description).toContain("23514");
  });
});
