import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {
    readContract: vi.fn(),
    simulateContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
  createHandleClient: vi.fn(),
  waitForPublicDecryption: vi.fn(),
}));

vi.mock("../src/chain/sepoliaRpc", () => ({
  createResilientSepoliaClient: () => mocks.client,
  defaultSepoliaRpcUrl: "https://rpc.example",
}));

vi.mock("@iexec-nox/handle", () => ({
  createViemHandleClient: mocks.createHandleClient,
}));

vi.mock("../src/transactions/publicDecryption", () => ({
  waitForPublicDecryption: mocks.waitForPublicDecryption,
}));

import { confirmCreatedTenderFunding } from "../src/transactions/tenderFunding";

const account = "0x1111111111111111111111111111111111111111" as const;
const triggerTransactionHash = `0x${"22".repeat(32)}` as const;
const confirmationTransactionHash = `0x${"33".repeat(32)}` as const;
const fundingHandle = `0x${"44".repeat(32)}` as const;
const proof = `0x${"55".repeat(64)}` as const;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.createHandleClient.mockResolvedValue({});
  mocks.waitForPublicDecryption.mockResolvedValue({
    value: true,
    decryptionProof: proof,
  });
  mocks.client.simulateContract.mockResolvedValue({ request: {} });
  mocks.client.waitForTransactionReceipt.mockResolvedValue({
    status: "success",
  });
});

describe("direct tender funding confirmation", () => {
  it("opens a FundingPending tender and removes its recovery checkpoint", async () => {
    mocks.client.readContract
      .mockResolvedValueOnce({ status: 0, fundingCheckHandle: fundingHandle })
      .mockResolvedValueOnce({ status: 1, fundingCheckHandle: fundingHandle });
    const walletClient = {
      writeContract: vi.fn().mockResolvedValue(confirmationTransactionHash),
    };
    const onStage = vi.fn();

    const result = await confirmCreatedTenderFunding({
      tenderId: 7n,
      triggerTransactionHash,
      walletClient: walletClient as never,
      account,
      onStage,
    });

    expect(result).toEqual({
      tenderId: 7n,
      status: "open",
      transactionHash: confirmationTransactionHash,
      alreadyResolved: false,
    });
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      "reading",
      "requesting-proof",
      "simulating",
      "signing",
      "confirming",
      "open",
    ]);
    expect(window.localStorage.getItem("veilbid:activity-recovery:v1")).toBe("[]");
  });

  it("treats a relay race as success after rereading the canonical state", async () => {
    mocks.client.readContract
      .mockResolvedValueOnce({ status: 0, fundingCheckHandle: fundingHandle })
      .mockResolvedValueOnce({ status: 1, fundingCheckHandle: fundingHandle });
    mocks.client.simulateContract.mockRejectedValue(
      new Error("TenderNotFundingPending"),
    );

    const result = await confirmCreatedTenderFunding({
      tenderId: 8n,
      triggerTransactionHash,
      walletClient: { writeContract: vi.fn() } as never,
      account,
      onStage: vi.fn(),
    });

    expect(result).toMatchObject({
      status: "open",
      transactionHash: null,
      alreadyResolved: true,
    });
    expect(window.localStorage.getItem("veilbid:activity-recovery:v1")).toBe("[]");
  });
});
