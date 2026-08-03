import { describe, expect, it } from "vitest";
import { recoveryExpectation } from "../src/activity/recoveryActions";

describe("Activity recovery state decisions", () => {
  it("resumes only funding-pending funding records", () => {
    expect(recoveryExpectation("funding", 0)).toBe("resume");
    expect(recoveryExpectation("funding", 1)).toBe("resolved");
    expect(recoveryExpectation("funding", 5)).toBe("resolved");
  });

  it("resumes only closed winner records and resolves terminal races", () => {
    expect(recoveryExpectation("winner", 1)).toBe("wait");
    expect(recoveryExpectation("winner", 2)).toBe("resume");
    expect(recoveryExpectation("winner", 3)).toBe("resolved");
    expect(recoveryExpectation("winner", 4)).toBe("resolved");
    expect(recoveryExpectation("winner", 5)).toBe("resolved");
  });
});
