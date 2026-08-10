import {
  decodeEventLog,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import marketAbiJson from "../../generated/abis/VeilBidMarket.json" with {
  type: "json",
};
import type { FlareQuorumPublicEvent } from "./types.js";

const marketAbi = marketAbiJson as Abi;
const publicEventNames = new Set([
  "TenderCreated",
  "TenderFunded",
  "BidSubmitted",
  "TenderClosed",
  "TenderAwarded",
  "TenderRefunded",
  "TenderCancelled",
  "ViewerGranted",
]);

export interface RawFlareQuorumLog {
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  data: Hex;
  topics: readonly [Hex, ...Hex[]];
}

function argumentsRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("FlareQuorum event arguments are malformed");
  }
  return value as Record<string, unknown>;
}

function bigintArgument(
  args: Record<string, unknown>,
  name: string,
): bigint {
  const value = args[name];
  if (typeof value !== "bigint") {
    throw new Error(`FlareQuorum event argument ${name} is not bigint`);
  }
  return value;
}

function addressArgument(
  args: Record<string, unknown>,
  name: string,
): Address {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`FlareQuorum event argument ${name} is not address`);
  }
  return value as Address;
}

function numberArgument(
  args: Record<string, unknown>,
  name: string,
): number {
  const value = args[name];
  if (typeof value !== "number") {
    throw new Error(`FlareQuorum event argument ${name} is not number`);
  }
  return value;
}

function hexArgument(args: Record<string, unknown>, name: string): Hex {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`FlareQuorum event argument ${name} is not hex`);
  }
  return value as Hex;
}

export function decodeFlareQuorumPublicEvent(
  log: RawFlareQuorumLog,
): FlareQuorumPublicEvent {
  const decoded = decodeEventLog({
    abi: marketAbi,
    data: log.data,
    topics: [...log.topics] as [Hex, ...Hex[]],
    strict: true,
  }) as {
    eventName: string;
    args: unknown;
  };
  if (!publicEventNames.has(decoded.eventName)) {
    throw new Error(`Unsupported FlareQuorum event: ${decoded.eventName}`);
  }
  const args = argumentsRecord(decoded.args);
  const position = {
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
  const tenderId = bigintArgument(args, "tenderId");

  switch (decoded.eventName) {
    case "TenderCreated":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        buyer: addressArgument(args, "buyer"),
        metadataHash: hexArgument(args, "metadataHash"),
        paymentToken: addressArgument(args, "paymentToken"),
        reviewViewer: addressArgument(args, "reviewViewer"),
        publicCeiling: bigintArgument(args, "publicCeiling"),
        bidDeadline: bigintArgument(args, "bidDeadline"),
        approvedVendorCount: numberArgument(args, "approvedVendorCount"),
      };
    case "TenderFunded":
      return { ...position, name: decoded.eventName, tenderId };
    case "BidSubmitted":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        bidId: bigintArgument(args, "bidId"),
        vendor: addressArgument(args, "vendor"),
      };
    case "TenderClosed":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        closeBlock: bigintArgument(args, "closeBlock"),
      };
    case "TenderAwarded":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        winnerBidId: bigintArgument(args, "winnerBidId"),
        winner: addressArgument(args, "winner"),
      };
    case "TenderRefunded":
    case "TenderCancelled":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        buyer: addressArgument(args, "buyer"),
      };
    case "ViewerGranted":
      return {
        ...position,
        name: decoded.eventName,
        tenderId,
        bidId: bigintArgument(args, "bidId"),
        viewer: addressArgument(args, "viewer"),
        grantor: addressArgument(args, "grantor"),
      };
    default:
      throw new Error(`Unsupported FlareQuorum event: ${decoded.eventName}`);
  }
}
