import { describe, expect, it } from "vitest";
import { prepareFlareFunding, encodeFlareDirectMintingCall } from "../src/transactions/flareFunding";

const terms = {
  metadataHash: `0x${"11".repeat(32)}` as const,
  rulesHash: `0x${"22".repeat(32)}` as const,
  publicCeilingXrp: 1_000_000n,
  bidDeadline: 2_000n,
  approvedVendors: ["0x3000000000000000000000000000000000000003"] as const,
  extensionId: 65_537n,
  codeVersion: `0x${"33".repeat(32)}` as const,
  teeIds: [
    "0x4000000000000000000000000000000000000004",
    "0x5000000000000000000000000000000000000005",
    "0x6000000000000000000000000000000000000006",
  ] as const,
  teeKeyFingerprints: [
    `0x${"44".repeat(32)}`,
    `0x${"55".repeat(32)}`,
    `0x${"66".repeat(32)}`,
  ] as const,
  ftsoFeedId: "0x015852502f55534400000000000000000000000000" as const,
};

describe("Flare funding preparation", () => {
  it("binds the XRPL memo expectation to the exact Smart Account user-op", () => {
    const preparation = prepareFlareFunding({
      personalAccount: "0x1000000000000000000000000000000000000001",
      nonce: 7n,
      fTestXrp: "0x0b6A3645c240605887a5532109323A3E12273dc7",
      market: "0x2000000000000000000000000000000000000002",
      terms,
      walletId: 3,
      executorFee: 25n,
      assetManager: "0x7000000000000000000000000000000000000007",
      transactionId: `0x${"99".repeat(32)}`,
      proofOwner: "0x7000000000000000000000000000000000000007",
      directMintingFeeBips: 25n,
      directMintingMinimumFeeUBA: 100_000n,
    });
    expect(preparation.memoData).toHaveLength(86);
    expect(preparation.proofExpectation.memoData).toBe(preparation.memoData);
    expect(preparation.userOperationCommitment).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(preparation.paymentQuote.paymentAmountUBA).toBe(1_100_025n);
  });

  it("does not encode a direct-mint call before an official proof validates", () => {
    const preparation = prepareFlareFunding({
      personalAccount: "0x1000000000000000000000000000000000000001",
      nonce: 1n,
      fTestXrp: "0x0b6A3645c240605887a5532109323A3E12273dc7",
      market: "0x2000000000000000000000000000000000000002",
      terms,
      walletId: 1,
      executorFee: 0n,
      assetManager: "0x7000000000000000000000000000000000000007",
      transactionId: `0x${"99".repeat(32)}`,
      proofOwner: "0x7000000000000000000000000000000000000007",
      directMintingFeeBips: 25n,
      directMintingMinimumFeeUBA: 100_000n,
    });
    expect(() => encodeFlareDirectMintingCall(preparation, { merkleProof: [], data: {} } as never)).toThrow("INVALID_FDC_PROOF");
  });
});
