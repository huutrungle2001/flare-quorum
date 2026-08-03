import type { Abi, Address, Hex } from "viem";
import marketAbiJson from "../generated/abis/VeilBidFlareMarket.json" with { type: "json" };

export const coston2ChainId = 114;
export const veilBidFlareMarketAbi = marketAbiJson as Abi;

export interface Coston2FlareDeployment {
  chainId: 114;
  market?: Address;
  foundationSender?: Address;
  extensionId?: bigint;
  codeVersion?: Hex;
  status: "planned" | "verified";
}

export function isCoston2FlareDeployment(value: unknown): value is Coston2FlareDeployment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Coston2FlareDeployment>;
  return candidate.chainId === coston2ChainId && (candidate.status === "planned" || candidate.status === "verified");
}
