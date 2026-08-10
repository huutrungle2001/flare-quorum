import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
} from "viem";
import { decodeFlareQuorumPublicEvent } from "../src/events/decode.ts";

const createdEvent = parseAbiItem(
  "event TenderCreated(uint256 indexed tenderId, address indexed buyer, bytes32 indexed metadataHash, address paymentToken, address reviewViewer, uint256 publicCeiling, uint64 bidDeadline, uint8 approvedVendorCount)",
);
const buyer = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const reviewViewer = "0x3333333333333333333333333333333333333333";
const metadataHash = `0x${"ab".repeat(32)}` as const;
const transactionHash = `0x${"12".repeat(32)}` as const;

describe("decodeFlareQuorumPublicEvent", () => {
  it("decodes only the public TenderCreated coordination fields", () => {
    const topics = encodeEventTopics({
      abi: [createdEvent],
      eventName: "TenderCreated",
      args: {
        tenderId: 7n,
        buyer,
        metadataHash,
      },
    });
    const data = encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint64" },
        { type: "uint8" },
      ],
      [token, reviewViewer, 100_000_000n, 2_000_000_000n, 3],
    );

    assert.deepEqual(
      decodeFlareQuorumPublicEvent({
        blockNumber: 90n,
        transactionHash,
        logIndex: 3,
        data,
        topics,
      }),
      {
        name: "TenderCreated",
        tenderId: 7n,
        buyer,
        metadataHash,
        paymentToken: token,
        reviewViewer,
        publicCeiling: 100_000_000n,
        bidDeadline: 2_000_000_000n,
        approvedVendorCount: 3,
        blockNumber: 90n,
        transactionHash,
        logIndex: 3,
      },
    );
  });

  it("rejects a topic that is not in the canonical market ABI", () => {
    const unknownEvent = parseAbiItem("event Unknown(uint256 value)");
    const topics = encodeEventTopics({
      abi: [unknownEvent],
      eventName: "Unknown",
      args: { value: 1n },
    });
    assert.throws(() =>
      decodeFlareQuorumPublicEvent({
        blockNumber: 1n,
        transactionHash,
        logIndex: 0,
        data: "0x",
        topics,
      }),
    );
  });
});
