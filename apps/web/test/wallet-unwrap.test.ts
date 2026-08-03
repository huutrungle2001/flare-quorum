import wrapperAbiJson from "@veilbid/chain-bindings/abis/VeilBidConfidentialUSDC";
import { decodeFunctionData, encodeFunctionData, type Abi, type Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  buildCustomWalletUnwrapCall,
  buildFullWalletUnwrapCall,
} from "../src/transactions/walletUnwrap";

const wrapperAbi = wrapperAbiJson as Abi;
const account = "0x1111111111111111111111111111111111111111" as Address;
const balanceHandle = `0x${"22".repeat(32)}` as const;
const customHandle = `0x${"33".repeat(32)}` as const;
const inputProof = `0x${"44".repeat(64)}` as const;

describe("EOA vcUSDC unwrap calls", () => {
  it("uses the current encrypted balance handle for a full unwrap", () => {
    const call = buildFullWalletUnwrapCall(account, balanceHandle);
    const decoded = decodeFunctionData({
      abi: wrapperAbi,
      data: encodeFunctionData({ abi: wrapperAbi, ...call }),
    });
    expect(decoded.functionName).toBe("unwrap");
    expect(decoded.args).toEqual([account, account, balanceHandle]);
  });

  it("uses the external encrypted-input overload for a custom unwrap", () => {
    const call = buildCustomWalletUnwrapCall(
      account,
      customHandle,
      inputProof,
    );
    const decoded = decodeFunctionData({
      abi: wrapperAbi,
      data: encodeFunctionData({ abi: wrapperAbi, ...call }),
    });
    expect(decoded.functionName).toBe("unwrap");
    expect(decoded.args).toEqual([
      account,
      account,
      customHandle,
      inputProof,
    ]);
  });
});
