import type { Abi, Address, Hex } from "viem";
import marketAbiJson from "../generated/abis/FlareQuorumMarketV2.json" with { type: "json" };
import awardReceiptAbiJson from "../generated/abis/FlareQuorumAwardReceiptV2.json" with { type: "json" };
import releaseManifestJson from "../generated/manifest.json" with { type: "json" };
export * from "./protocol.js";
export * from "./smart-account.js";
export * from "./fdc.js";
export * from "./fdc-client.js";
export * from "./fassets.js";
export * from "./fcc-result.js";
export * from "./public-market.js";
export * from "./private-bid.js";
export * from "./public-brief.js";

export const coston2ChainId = 114;
/** Stable consumer export; currently bound to the selected FlareQuorumMarketV2 ABI. */
export const flareQuorumFlareMarketAbi = marketAbiJson as Abi;
/** Stable consumer export; currently bound to the selected FlareQuorumAwardReceiptV2 ABI. */
export const flareQuorumFlareAwardReceiptAbi = awardReceiptAbiJson as Abi;

export interface Coston2FlarePublicRelease {
  network: "coston2";
  chainId: 114;
  status: "planned" | "verified";
  deploymentBlock: string;
  market: Address;
  awardReceipt: Address;
  fcc: {
    manager: Address;
    extensionId: string;
    codeHash: Hex;
    version: string;
    resultThreshold: number;
    teeIds: readonly Address[];
    teeKeyFingerprints: readonly Hex[];
  };
  protocols: {
    fTestXRP: Address;
    assetManagerFXRP: Address;
    ftsoV2: Address;
    xrpUsdFeedId: Hex;
    fdcHub: Address;
    fdcVerification: Address;
    masterAccountController: Address;
    relay: Address;
  };
}

export const coston2FlarePublicRelease = releaseManifestJson as Coston2FlarePublicRelease;

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
