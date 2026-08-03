import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeActionHandoff } from "../src/safe/SafeTreasuryWorkspace";
import {
  safeReleaseConfiguration,
  type SafePreparationResult,
} from "../src/safe/safePreparation";

const result = {
  kind: "tender",
  actionHash: `0x${"11".repeat(32)}`,
  safe: safeReleaseConfiguration.safe,
  target: "0x4444444444444444444444444444444444444444",
  safeTransactionData: `0x${"55".repeat(96)}`,
  preparationTransactionData: `0x${"66".repeat(96)}`,
  transactions: [
    {
      to: "0x6666666666666666666666666666666666666666",
      value: "0",
      data: `0x${"66".repeat(96)}`,
    },
    {
      to: "0x4444444444444444444444444444444444444444",
      value: "0",
      data: `0x${"55".repeat(96)}`,
    },
  ],
  safeTxHash: `0x${"22".repeat(32)}`,
  threshold: 2,
  confirmations: 1,
  executed: false,
  executionTransactionHash: null,
} as SafePreparationResult;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Safe transaction handoff", () => {
  it("exposes proposal status and copies the atomic Safe batch", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<SafeActionHandoff result={result} />);

    expect(screen.getByLabelText("Safe target contract")).toHaveValue(
      result.target,
    );
    expect(screen.getByLabelText("Safe transaction calldata")).toHaveValue(
      result.safeTransactionData,
    );
    expect(screen.getByRole("link", { name: /open safe/i })).toHaveAttribute(
      "href",
      expect.stringContaining(result.safe),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "COPY BATCH JSON" }),
    );
    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(result.transactions);
    expect(await screen.findByText("Transaction JSON copied.")).toBeInTheDocument();
  });
});
