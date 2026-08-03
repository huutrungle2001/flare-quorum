import {
  buildPublicLogBlockRanges,
  buildPublicMarketIndex,
  decodeVeilBidPublicEvent,
} from "@veilbid/chain-bindings";
import receiptAbiJson from "@veilbid/chain-bindings/abis/VeilBidAwardReceipt" with {
  type: "json",
};
import marketAbiJson from "@veilbid/chain-bindings/abis/VeilBidMarket" with {
  type: "json",
};
import deploymentJson from "@veilbid/chain-bindings/addresses/sepolia.release" with {
  type: "json",
};
import {
  createPublicClient,
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import type {
  AwardEvidence,
  OperatorSnapshot,
  PublicOperatorSource,
} from "./types.js";

const confirmationDepth = 12n;
const marketAbi = marketAbiJson as Abi;
const receiptAbi = receiptAbiJson as Abi;

interface Deployment {
  chainId: number;
  kind: string;
  verified: boolean;
  contracts: {
    VeilBidMarket: { address: Address; deploymentBlock: string };
    VeilBidAwardReceipt: { address: Address };
  };
}

const deployment = deploymentJson as Deployment;

export class LivePublicOperatorSource implements PublicOperatorSource {
  readonly #client: PublicClient;

  constructor(rpcUrl: string) {
    if (!rpcUrl) throw new Error("missing-sepolia-rpc-url");
    if (deployment.chainId !== sepolia.id) {
      throw new Error("deployment-chain-mismatch");
    }
    this.#client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
  }

  async snapshot(): Promise<OperatorSnapshot> {
    const latest = await this.#client.getBlock({ blockTag: "latest" });
    const finalizedBlock =
      latest.number > confirmationDepth
        ? latest.number - confirmationDepth
        : 0n;
    const fromBlock = BigInt(
      deployment.contracts.VeilBidMarket.deploymentBlock,
    );
    const events = [];
    if (finalizedBlock >= fromBlock) {
      for (const range of buildPublicLogBlockRanges(
        fromBlock,
        finalizedBlock,
      )) {
        const logs = await this.#client.getLogs({
          address: deployment.contracts.VeilBidMarket.address,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        });
        for (const log of logs) {
          if (
            log.blockNumber === null ||
            log.transactionHash === null ||
            log.logIndex === null ||
            log.topics.length === 0
          ) {
            continue;
          }
          events.push(
            decodeVeilBidPublicEvent({
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
              logIndex: log.logIndex,
              data: log.data,
              topics: log.topics as [Hex, ...Hex[]],
            }),
          );
        }
      }
    }
    return {
      index: buildPublicMarketIndex(events),
      chainTimestamp: latest.timestamp,
      latestBlock: latest.number,
      finalizedBlock,
      deploymentKind: deployment.kind,
      deploymentVerified: deployment.verified,
    };
  }

  async settlementFlags(tenderId: bigint) {
    const [winnerIdPubliclyDecryptable, canFinalize] =
      await Promise.all([
        this.#client.readContract({
          address: deployment.contracts.VeilBidMarket.address,
          abi: marketAbi,
          functionName: "winnerIdIsPubliclyDecryptable",
          args: [tenderId],
        }),
        this.#client.readContract({
          address: deployment.contracts.VeilBidMarket.address,
          abi: marketAbi,
          functionName: "canFinalize",
          args: [tenderId],
        }),
      ]);
    return {
      winnerIdPubliclyDecryptable:
        winnerIdPubliclyDecryptable === true,
      canFinalize: canFinalize === true,
      refundRequiresZeroWinnerProof: true,
    };
  }

  async awardEvidence(tenderId: bigint): Promise<AwardEvidence | null> {
    try {
      const award = (await this.#client.readContract({
        address: deployment.contracts.VeilBidAwardReceipt.address,
        abi: receiptAbi,
        functionName: "getAward",
        args: [tenderId],
      })) as AwardEvidence;
      return award;
    } catch {
      return null;
    }
  }

  async bidViewableBy(
    tenderId: bigint,
    bidId: bigint,
    account: Address,
  ): Promise<boolean> {
    return (
      (await this.#client.readContract({
        address: deployment.contracts.VeilBidMarket.address,
        abi: marketAbi,
        functionName: "bidViewableBy",
        args: [tenderId, bidId, account],
      })) === true
    );
  }
}
