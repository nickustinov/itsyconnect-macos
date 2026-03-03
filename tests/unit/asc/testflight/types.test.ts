import { describe, it, expect } from "vitest";
import { deriveBuildStatus } from "@/lib/asc/testflight/types";

describe("deriveBuildStatus", () => {
  it("returns 'Processing' for PROCESSING state", () => {
    expect(deriveBuildStatus("PROCESSING", null, null, false)).toBe("Processing");
  });

  it("returns 'Invalid' for FAILED state", () => {
    expect(deriveBuildStatus("FAILED", null, null, false)).toBe("Invalid");
  });

  it("returns 'Invalid' for INVALID state", () => {
    expect(deriveBuildStatus("INVALID", null, null, false)).toBe("Invalid");
  });

  it("returns 'Expired' when expired flag is true", () => {
    expect(deriveBuildStatus("VALID", null, null, true)).toBe("Expired");
  });

  it("returns 'Testing' for IN_BETA_TESTING", () => {
    expect(deriveBuildStatus("VALID", "IN_BETA_TESTING", null, false)).toBe("Testing");
  });

  it("returns 'Ready to test' for READY_FOR_BETA_TESTING", () => {
    expect(deriveBuildStatus("VALID", "READY_FOR_BETA_TESTING", null, false)).toBe("Ready to test");
  });

  it("returns 'Ready to test' for BETA_APPROVED", () => {
    expect(deriveBuildStatus("VALID", "BETA_APPROVED", null, false)).toBe("Ready to test");
  });

  it("returns 'Waiting for review' for WAITING_FOR_BETA_REVIEW", () => {
    expect(deriveBuildStatus("VALID", "WAITING_FOR_BETA_REVIEW", null, false)).toBe("Waiting for review");
  });

  it("returns 'In beta review' for IN_BETA_REVIEW", () => {
    expect(deriveBuildStatus("VALID", "IN_BETA_REVIEW", null, false)).toBe("In beta review");
  });

  it("returns 'Rejected' for BETA_REJECTED", () => {
    expect(deriveBuildStatus("VALID", "BETA_REJECTED", null, false)).toBe("Rejected");
  });

  it("returns 'Ready to submit' for READY_FOR_BETA_SUBMISSION", () => {
    expect(deriveBuildStatus("VALID", "READY_FOR_BETA_SUBMISSION", null, false)).toBe("Ready to submit");
  });

  it("returns 'Missing compliance' for MISSING_EXPORT_COMPLIANCE", () => {
    expect(deriveBuildStatus("VALID", "MISSING_EXPORT_COMPLIANCE", null, false)).toBe("Missing compliance");
  });

  it("returns 'In compliance review' for IN_EXPORT_COMPLIANCE_REVIEW", () => {
    expect(deriveBuildStatus("VALID", "IN_EXPORT_COMPLIANCE_REVIEW", null, false)).toBe("In compliance review");
  });

  it("returns 'Processing exception' for PROCESSING_EXCEPTION", () => {
    expect(deriveBuildStatus("VALID", "PROCESSING_EXCEPTION", null, false)).toBe("Processing exception");
  });

  it("returns 'Expired' for EXPIRED state string", () => {
    expect(deriveBuildStatus("VALID", "EXPIRED", null, false)).toBe("Expired");
  });

  it("returns 'N/A' for NOT_APPLICABLE", () => {
    expect(deriveBuildStatus("VALID", "NOT_APPLICABLE", null, false)).toBe("N/A");
  });

  it("falls back to internalBuildState when externalBuildState is null", () => {
    expect(deriveBuildStatus("VALID", null, "IN_BETA_TESTING", false)).toBe("Testing");
  });

  it("returns 'Unknown' when both states are null", () => {
    expect(deriveBuildStatus("VALID", null, null, false)).toBe("Unknown");
  });

  it("returns the raw state for unrecognised state strings", () => {
    expect(deriveBuildStatus("VALID", "SOME_NEW_STATE", null, false)).toBe("SOME_NEW_STATE");
  });
});
