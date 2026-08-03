import {
  assetManagerFAssetsAbi,
  fdcHubAbi,
  fdcRequestFeeConfigurationsAbi,
  fdcVerificationProtocolAbi,
  flareContractRegistryAbi,
  flareSystemsManagerAbi,
  relayFinalizationAbi,
  smartAccountReaderAbi,
  veilBidFlareMarketAbi,
  type XrpPaymentProof,
} from "@veilbid/flare-bindings";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { FlareFundingConfig } from "./flare-funding-config.js";

const FINALITY_DEPTH = 12n;

const coston2Chain = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

export interface FlareFundingContracts {
  fdcHub: Address;
  fdcRequestFeeConfigurations: Address;
  fdcVerification: Address;
  flareSystemsManager: Address;
  relay: Address;
  assetManager: Address;
  masterAccountController: Address;
}

export interface FlareFundingNetwork {
  chainId: 114;
  blockNumber: bigint;
  finalizedBlock: bigint;
  contracts: FlareFundingContracts;
  fTestXrp: Address;
  directMintingPaymentAddress: string;
  directMintingFeeBips: bigint;
  directMintingMinimumFeeUBA: bigint;
  marketRuntimeCodeHash: Hex;
}

export interface FundingTransactionReceipt {
  transactionHash: Hex;
  blockNumber: bigint;
  status: "success" | "reverted";
  logs: readonly Log[];
}

export interface FlareFundingChain {
  readonly executorAddress: Address | null;
  inspectNetwork(): Promise<FlareFundingNetwork>;
  getSmartAccountNonce(controller: Address, personalAccount: Address): Promise<bigint>;
  getPersonalAccount(controller: Address, xrplOwner: string): Promise<Address>;
  getRequestFee(fdcHub: Address, request: Hex): Promise<bigint>;
  submitAttestationRequest(
    fdcHub: Address,
    request: Hex,
    fee: bigint,
  ): Promise<FundingTransactionReceipt>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
  getFdcTiming(manager: Address): Promise<{
    firstVotingRoundStartTimestamp: bigint;
    votingEpochDurationSeconds: bigint;
  }>;
  getFdcProtocolId(verification: Address): Promise<bigint>;
  isFdcFinalized(relay: Address, protocolId: bigint, votingRoundId: bigint): Promise<boolean>;
  executeDirectMinting(
    assetManager: Address,
    proof: XrpPaymentProof,
    userOperationData: Hex,
    value: bigint,
  ): Promise<FundingTransactionReceipt>;
}

function receipt(value: {
  transactionHash: Hex;
  blockNumber: bigint;
  status: "success" | "reverted";
  logs: readonly Log[];
}): FundingTransactionReceipt {
  return {
    transactionHash: value.transactionHash,
    blockNumber: value.blockNumber,
    status: value.status,
    logs: value.logs,
  };
}

export class LiveFlareFundingChain implements FlareFundingChain {
  readonly config: FlareFundingConfig;
  readonly publicClient;
  readonly walletClient;
  readonly account;
  readonly executorAddress: Address | null;

  constructor(config: FlareFundingConfig) {
    this.config = config;
    this.publicClient = createPublicClient({
      chain: coston2Chain,
      transport: http(config.rpcUrl, { retryCount: 2, timeout: 20_000 }),
    });
    this.account = config.executorPrivateKey
      ? privateKeyToAccount(config.executorPrivateKey)
      : null;
    this.executorAddress = this.account?.address ?? null;
    this.walletClient = this.account
      ? createWalletClient({
          account: this.account,
          chain: coston2Chain,
          transport: http(config.rpcUrl, { retryCount: 1, timeout: 20_000 }),
        })
      : null;
  }

  private async registryAddress(name: string, blockNumber: bigint): Promise<Address> {
    return getAddress(await this.publicClient.readContract({
      address: this.config.contractRegistry,
      abi: flareContractRegistryAbi,
      functionName: "getContractAddressByName",
      args: [name],
      blockNumber,
    }));
  }

  async inspectNetwork(): Promise<FlareFundingNetwork> {
    const [chainId, blockNumber] = await Promise.all([
      this.publicClient.getChainId(),
      this.publicClient.getBlockNumber(),
    ]);
    if (chainId !== 114) throw new Error("WRONG_FLARE_FUNDING_CHAIN");
    const finalizedBlock = blockNumber > FINALITY_DEPTH ? blockNumber - FINALITY_DEPTH : 0n;
    if (this.config.marketDeploymentBlock > finalizedBlock) {
      throw new Error("FLARE_MARKET_DEPLOYMENT_NOT_FINALIZED");
    }
    const names = [
      "FdcHub",
      "FdcRequestFeeConfigurations",
      "FdcVerification",
      "FlareSystemsManager",
      "Relay",
      "AssetManagerFXRP",
      "MasterAccountController",
    ] as const;
    const resolved = await Promise.all(
      names.map((name) => this.registryAddress(name, finalizedBlock)),
    );
    const contracts: FlareFundingContracts = {
      fdcHub: resolved[0],
      fdcRequestFeeConfigurations: resolved[1],
      fdcVerification: resolved[2],
      flareSystemsManager: resolved[3],
      relay: resolved[4],
      assetManager: resolved[5],
      masterAccountController: resolved[6],
    };
    const codeAddresses = [
      this.config.contractRegistry,
      this.config.marketAddress,
      ...Object.values(contracts),
    ];
    const codes = await Promise.all(codeAddresses.map((address) =>
      this.publicClient.getCode({ address, blockNumber: finalizedBlock })));
    if (codes.some((code) => code === undefined || code === "0x")) {
      throw new Error("FLARE_FUNDING_CONTRACT_CODE_MISSING");
    }
    const [
      feeConfigFromHub,
      fTestXrp,
      directMintingPaymentAddress,
      feeBips,
      minimumFee,
      marketPaymentToken,
      marketTeeCount,
      marketResultThreshold,
    ] =
      await Promise.all([
        this.publicClient.readContract({
          address: contracts.fdcHub,
          abi: fdcHubAbi,
          functionName: "fdcRequestFeeConfigurations",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: contracts.assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "fAsset",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: contracts.assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "directMintingPaymentAddress",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: contracts.assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "getDirectMintingFeeBIPS",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: contracts.assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "getDirectMintingMinimumFeeUBA",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: this.config.marketAddress,
          abi: veilBidFlareMarketAbi,
          functionName: "paymentToken",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: this.config.marketAddress,
          abi: veilBidFlareMarketAbi,
          functionName: "TEE_COUNT",
          blockNumber: finalizedBlock,
        }),
        this.publicClient.readContract({
          address: this.config.marketAddress,
          abi: veilBidFlareMarketAbi,
          functionName: "RESULT_THRESHOLD",
          blockNumber: finalizedBlock,
        }),
      ]);
    if (
      getAddress(feeConfigFromHub) !== contracts.fdcRequestFeeConfigurations ||
      getAddress(fTestXrp) !== this.config.expectedFTestXrp ||
      typeof marketPaymentToken !== "string" ||
      getAddress(marketPaymentToken) !== this.config.expectedFTestXrp ||
      marketTeeCount !== 3n ||
      marketResultThreshold !== 2 ||
      directMintingPaymentAddress.trim() === "" ||
      feeBips >= 10_000n
    ) {
      throw new Error("FLARE_FUNDING_PROTOCOL_BINDING_MISMATCH");
    }
    return {
      chainId: 114,
      blockNumber,
      finalizedBlock,
      contracts,
      fTestXrp: getAddress(fTestXrp),
      directMintingPaymentAddress,
      directMintingFeeBips: feeBips,
      directMintingMinimumFeeUBA: minimumFee,
      marketRuntimeCodeHash: keccak256(codes[1]!),
    };
  }

  async getSmartAccountNonce(
    controller: Address,
    personalAccount: Address,
  ): Promise<bigint> {
    return this.publicClient.readContract({
      address: controller,
      abi: smartAccountReaderAbi,
      functionName: "getNonce",
      args: [personalAccount],
    });
  }

  async getPersonalAccount(controller: Address, xrplOwner: string): Promise<Address> {
    return getAddress(await this.publicClient.readContract({
      address: controller,
      abi: smartAccountReaderAbi,
      functionName: "getPersonalAccount",
      args: [xrplOwner],
    }));
  }

  async getRequestFee(fdcHub: Address, request: Hex): Promise<bigint> {
    const feeConfig = getAddress(await this.publicClient.readContract({
      address: fdcHub,
      abi: fdcHubAbi,
      functionName: "fdcRequestFeeConfigurations",
    }));
    return this.publicClient.readContract({
      address: feeConfig,
      abi: fdcRequestFeeConfigurationsAbi,
      functionName: "getRequestFee",
      args: [request],
    });
  }

  private requireWriter() {
    if (!this.account || !this.walletClient) throw new Error("FLARE_FUNDING_WRITE_DISABLED");
    return { account: this.account, walletClient: this.walletClient };
  }

  async submitAttestationRequest(
    fdcHub: Address,
    request: Hex,
    fee: bigint,
  ): Promise<FundingTransactionReceipt> {
    const writer = this.requireWriter();
    await this.publicClient.simulateContract({
      account: writer.account,
      address: fdcHub,
      abi: fdcHubAbi,
      functionName: "requestAttestation",
      args: [request],
      value: fee,
    });
    const hash = await writer.walletClient.writeContract({
      account: writer.account,
      address: fdcHub,
      abi: fdcHubAbi,
      functionName: "requestAttestation",
      args: [request],
      value: fee,
    });
    return receipt(await this.publicClient.waitForTransactionReceipt({ hash }));
  }

  async getBlockTimestamp(blockNumber: bigint): Promise<bigint> {
    return (await this.publicClient.getBlock({ blockNumber })).timestamp;
  }

  async getFdcTiming(manager: Address): Promise<{
    firstVotingRoundStartTimestamp: bigint;
    votingEpochDurationSeconds: bigint;
  }> {
    const [firstVotingRoundStartTimestamp, votingEpochDurationSeconds] =
      await Promise.all([
        this.publicClient.readContract({
          address: manager,
          abi: flareSystemsManagerAbi,
          functionName: "firstVotingRoundStartTs",
        }),
        this.publicClient.readContract({
          address: manager,
          abi: flareSystemsManagerAbi,
          functionName: "votingEpochDurationSeconds",
        }),
      ]);
    return { firstVotingRoundStartTimestamp, votingEpochDurationSeconds };
  }

  async getFdcProtocolId(verification: Address): Promise<bigint> {
    return BigInt(await this.publicClient.readContract({
      address: verification,
      abi: fdcVerificationProtocolAbi,
      functionName: "fdcProtocolId",
    }));
  }

  async isFdcFinalized(
    relay: Address,
    protocolId: bigint,
    votingRoundId: bigint,
  ): Promise<boolean> {
    return this.publicClient.readContract({
      address: relay,
      abi: relayFinalizationAbi,
      functionName: "isFinalized",
      args: [protocolId, votingRoundId],
    });
  }

  async executeDirectMinting(
    assetManager: Address,
    proof: XrpPaymentProof,
    userOperationData: Hex,
    value: bigint,
  ): Promise<FundingTransactionReceipt> {
    const writer = this.requireWriter();
    await this.publicClient.simulateContract({
      account: writer.account,
      address: assetManager,
      abi: assetManagerFAssetsAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, userOperationData],
      value,
    });
    const hash = await writer.walletClient.writeContract({
      account: writer.account,
      address: assetManager,
      abi: assetManagerFAssetsAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, userOperationData],
      value,
    });
    return receipt(await this.publicClient.waitForTransactionReceipt({ hash }));
  }
}
