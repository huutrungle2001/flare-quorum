import {
  buildPublicLogBlockRanges,
  buildPublicMarketIndex,
  decodeVeilBidPublicEvent,
  publicLogBlockChunkSize,
  type PublicMarketIndex,
} from "@veilbid/chain-bindings";
import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import {
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import {
  createResilientSepoliaClient,
  defaultSepoliaRpcUrl,
} from "../chain/sepoliaRpc";

const finalityDepth = 12n;
export { defaultSepoliaRpcUrl };
export { buildPublicLogBlockRanges, publicLogBlockChunkSize };

interface DeploymentContract {
  address: Address;
  deploymentBlock: string;
}

interface Deployment {
  chainId: number;
  kind: string;
  verified: boolean;
  contracts: {
    VeilBidMarket: DeploymentContract;
  };
}

const releaseDeployment = deployment as Deployment;

export interface LoadedPublicMarket {
  index: PublicMarketIndex;
  indexedBlock: bigint;
  finalizedBlock: bigint;
  latestBlock: bigint;
  deploymentKind: string;
  deploymentVerified: boolean;
}

export async function loadPublicMarket(
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ??
    defaultSepoliaRpcUrl,
): Promise<LoadedPublicMarket> {
  if (releaseDeployment.chainId !== sepolia.id) {
    throw new Error("Generated deployment chain does not match Sepolia");
  }
  const client = createResilientSepoliaClient(rpcUrl);
  const latestBlock = await client.getBlockNumber();
  // The browser reads through the latest mined block for responsive UX. The
  // separate finality boundary lets the UI label recent dossiers honestly.
  const indexedBlock = latestBlock;
  const finalizedBlock =
    latestBlock > finalityDepth
      ? latestBlock - finalityDepth
      : 0n;
  const fromBlock = BigInt(
    releaseDeployment.contracts.VeilBidMarket.deploymentBlock,
  );
  if (indexedBlock < fromBlock) {
    return {
      index: buildPublicMarketIndex([]),
      indexedBlock,
      finalizedBlock,
      latestBlock,
      deploymentKind: releaseDeployment.kind,
      deploymentVerified: releaseDeployment.verified,
    };
  }

  const decoded = [];
  for (const range of buildPublicLogBlockRanges(
    fromBlock,
    indexedBlock,
  )) {
    const logs = await client.getLogs({
      address: releaseDeployment.contracts.VeilBidMarket.address,
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
      decoded.push(
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

  return {
    index: buildPublicMarketIndex(decoded),
    indexedBlock,
    finalizedBlock,
    latestBlock,
    deploymentKind: releaseDeployment.kind,
    deploymentVerified: releaseDeployment.verified,
  };
}
