import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendXrplTestnetPaymentWithGemWallet } from "../src/flare/xrplWallet";

const mocks = vi.hoisted(() => ({
  getNetwork: vi.fn(),
  getAddress: vi.fn(),
  sendPayment: vi.fn(),
}));

vi.mock("@gemwallet/api", () => mocks);

const owner = "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p";
const memoData = `0x${"fe".repeat(42)}` as `0x${string}`;

describe("GemWallet XRPL Testnet boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getNetwork.mockResolvedValue({ type: "response", result: { chain: "XRPL", network: "Testnet" } });
    mocks.getAddress.mockResolvedValue({ type: "response", result: { address: owner } });
    mocks.sendPayment.mockResolvedValue({ type: "response", result: { hash: `0x${"ab".repeat(32)}` } });
  });

  it("requires the wallet to be on XRPL Testnet", async () => {
    mocks.getNetwork.mockResolvedValue({ type: "response", result: { chain: "XRPL", network: "Mainnet" } });
    await expect(sendXrplTestnetPaymentWithGemWallet({ owner, destination: owner, amountUBA: "1000000", memoData }))
      .rejects.toThrow("XRPL_WALLET_WRONG_NETWORK");
    expect(mocks.sendPayment).not.toHaveBeenCalled();
  });

  it("binds the payment to the wallet address and submits only the public memo", async () => {
    const hash = await sendXrplTestnetPaymentWithGemWallet({ owner, destination: owner, amountUBA: "1000000", memoData });
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    expect(mocks.sendPayment).toHaveBeenCalledWith({
      amount: "1000000",
      destination: owner,
      memos: [{ memo: { memoData: "FE".repeat(42), memoType: "VEILBID_0XFE" } }],
    });
  });

  it("rejects a wallet account mismatch before asking for a signature", async () => {
    mocks.getAddress.mockResolvedValue({ type: "response", result: { address: "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn" } });
    await expect(sendXrplTestnetPaymentWithGemWallet({ owner, destination: owner, amountUBA: "1000000", memoData }))
      .rejects.toThrow("XRPL_WALLET_OWNER_MISMATCH");
    expect(mocks.sendPayment).not.toHaveBeenCalled();
  });
});

