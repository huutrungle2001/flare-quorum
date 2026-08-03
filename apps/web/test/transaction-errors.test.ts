import { describe, expect, it } from "vitest";
import { transactionErrorMessage } from "../src/transactions/errors";

describe("transaction error presentation", () => {
  it("turns an expired-bid revert into a short recovery message", () => {
    const raw = new Error(
      `The contract function \"submitBid\" reverted. BidDeadlinePassed() Contract Call: inputProof 0x${"ab".repeat(128)}`,
    );
    const message = transactionErrorMessage(raw, "Bid submission failed.");
    expect(message).toMatch(/deadline has passed/i);
    expect(message).not.toContain("inputProof");
    expect(message).not.toContain("0x");
  });

  it("never renders long encoded payloads from a provider error", () => {
    const raw = new Error(`Provider failed with 0x${"cd".repeat(64)}`);
    expect(transactionErrorMessage(raw, "Safe action failed.")).toBe(
      "Safe action failed.",
    );
  });

  it("preserves concise validation errors", () => {
    expect(
      transactionErrorMessage(
        new Error("Public ceiling exceeds the available Safe vcUSDC balance."),
        "Safe action failed.",
      ),
    ).toBe("Public ceiling exceeds the available Safe vcUSDC balance.");
  });
});
