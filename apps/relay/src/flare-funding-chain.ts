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
// The first 0xFE execution may deploy the deterministic Personal Account via
// the singleton factory before running the approval and tender calls. Coston2
// RPC estimators have returned a lower limit than the actual CREATE2 path, so
// reserve a bounded margin while staying well below the 8M block gas limit.
const SMART_ACCOUNT_DIRECT_MINT_GAS_LIMIT = 3_000_000n;

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
  directMintingExecutorFeeUBA: bigint;
  marketRuntimeCodeHash: Hex;
}

export interface FundingTransactionReceipt {
  transactionHash: Hex;
  blockNumber: bigint;
  status: "success" | "reverted";
  logs: readonly Log[];
}

export interface FlareFundingTenderFact {
  buyer: Address;
  rulesHash: Hex;
  publicCeilingXrp: bigint;
}

export interface FlareFundingChain {
  readonly executorAddress: Address | null;
  inspectNetwork(): Promise<FlareFundingNetwork>;
  getSmartAccountNonce(controller: Address, personalAccount: Address): Promise<bigint>;
  getPersonalAccount(controller: Address, xrplOwner: string): Promise<Address>;
  /** Optional state fallback when a nested receipt log is temporarily incomplete. */
  getMarketTenderCount?(market: Address): Promise<bigint>;
  getMarketTender?(market: Address, tenderId: bigint): Promise<FlareFundingTenderFact>;
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

function directMintFailureCode(error: unknown): string {
  const strings: string[] = [];
  const selectors: string[] = [];
  const nestedSelectors: string[] = [];
  let hasEncodedCallFailure = false;
  const selectorNames: Record<string, string> = {
    "a5fa8d2b": "callfailed",
    "5c0dee5d": "personalaccountcallfailed",
    "8164f842": "approvalfailed",
    "b780453e": "invalidtender",
    "289aef69": "invalidtokentransfer",
    "0ec288f4": "invalidcodeversion",
    "c82c69fc": "notregisteredtee",
    "4c7a9c61": "notenoughteeidentities",
    "a0581a0e": "invalidscoringpolicy",
    "e6c4247b": "invalidaddress",
    "f924664d": "invalidstatus",
  };
  const addSelector = (value: string, nested = false): void => {
    const normalized = value.toLowerCase();
    (nested ? nestedSelectors : selectors).push(normalized);
    const name = selectorNames[normalized];
    if (name) strings.push(name);
  };
  const inspectHexPayload = (value: string, allowEncoded = false): void => {
    const matches = value.match(/0x[0-9a-fA-F]{8,}/g) ?? [];
    for (const match of matches) {
      const body = match.slice(2);
      if (body.length < 8) continue;
      const selector = body.slice(0, 8).toLowerCase();
      // Addresses and hashes frequently occur in viem's diagnostic text.
      // Treat a long hex value as revert data only when it is attached to a
      // data-bearing error field, or when its selector is a known error.
      if (body.length === 8 || allowEncoded || selector in selectorNames) {
        addSelector(selector);
      }
      // IMemoInstructionsFacet.CallFailed(bytes) ABI-encodes the inner
      // personal-account revert after a dynamic offset and length. Keep only
      // the nested selector; never surface the return-data body itself.
      if (selector === "a5fa8d2b" && body.length >= 8 + 64 + 64) {
        hasEncodedCallFailure = true;
        const offset = Number.parseInt(body.slice(8, 8 + 64), 16);
        const lengthStart = 8 + offset * 2;
        if (Number.isSafeInteger(offset) && lengthStart + 64 <= body.length) {
          const length = Number.parseInt(body.slice(lengthStart, lengthStart + 64), 16);
          const dataStart = lengthStart + 64;
          if (Number.isSafeInteger(length) && length >= 4 && dataStart + 8 <= body.length) {
            addSelector(body.slice(dataStart, dataStart + 8), true);
          }
        }
      }
    }
  };
  const visit = (value: unknown, depth: number, sourceKey = ""): void => {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value === "string") {
      strings.push(value);
      inspectHexPayload(value, sourceKey === "data" || sourceKey === "originalError");
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["data", "cause", "error", "originalError", "details", "shortMessage", "message"]) {
      visit(record[key], depth + 1, key);
    }
  };
  visit(error, 0);
  const normalized = strings.join(" ").toLowerCase();
  const known = [
    // Prefer a nested personal-account/market error over the outer
    // IMemoInstructionsFacet.CallFailed(bytes) wrapper.
    "invalidtender",
    "invalidtokentransfer",
    "invalidcodeversion",
    "notregisteredtee",
    "notenoughteeidentities",
    "invalidscoringpolicy",
    "approvalfailed",
    "invalidstatus",
    "personalaccountcallfailed",
    "invalidsender",
    "invalidnonce",
    "wrongexecutor",
    "custominstructionhashmismatch",
    "invalidmemodata",
    "invalidinstructionid",
    "callfailed",
    "transactionalreadyprocessed",
    "transactionattestationfailed",
    "invalidproof",
    "directmintingpaymenttoosmallforfee",
  ];
  const knownError = known.find((name) => normalized.includes(name));
  if (knownError && knownError !== "callfailed") {
    return `DIRECT_MINT_${knownError.toUpperCase()}`;
  }
  const nestedSelector = nestedSelectors[0];
  if (nestedSelector) return `DIRECT_MINT_REVERT_${nestedSelector.toUpperCase()}`;
  if (knownError === "callfailed") {
    return hasEncodedCallFailure ? "DIRECT_MINT_CALLFAILED_NO_NESTED_DATA" : "DIRECT_MINT_CALLFAILED_NO_PAYLOAD";
  }
  if (knownError) return `DIRECT_MINT_${knownError.toUpperCase()}`;
  const selectorMarker = selectors[0];
  if (selectorMarker) return `DIRECT_MINT_REVERT_${selectorMarker.toUpperCase()}`;
  if (normalized.includes("insufficient funds")) return "DIRECT_MINT_INSUFFICIENT_FUNDS";
  if (normalized.includes("nonce")) return "DIRECT_MINT_NONCE_ERROR";
  if (normalized.includes("gas")) return "DIRECT_MINT_GAS_ERROR";
  if (normalized.includes("revert")) return "DIRECT_MINT_REVERT";
  return "DIRECT_MINT_SIMULATION_ERROR";
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
      executorFee,
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
          address: contracts.assetManager,
          abi: assetManagerFAssetsAbi,
          functionName: "getDirectMintingExecutorFeeUBA",
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
      directMintingExecutorFeeUBA: executorFee,
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

  async getMarketTenderCount(market: Address): Promise<bigint> {
    const count = await this.publicClient.readContract({
      address: market,
      abi: veilBidFlareMarketAbi,
      functionName: "tenderCount",
    }) as bigint;
    return count;
  }

  async getMarketTender(market: Address, tenderId: bigint): Promise<FlareFundingTenderFact> {
    const value = await this.publicClient.readContract({
      address: market,
      abi: veilBidFlareMarketAbi,
      functionName: "getTender",
      args: [tenderId],
    }) as Record<string, unknown> & readonly unknown[];
    const buyer = value.buyer ?? value[0];
    const rulesHash = value.rulesHash ?? value[2];
    const publicCeilingXrp = value.publicCeilingXrp ?? value[3];
    if (
      typeof buyer !== "string" || typeof rulesHash !== "string" ||
      typeof publicCeilingXrp !== "bigint"
    ) {
      throw new Error("FLARE_MARKET_TENDER_STATE_INVALID");
    }
    return {
      buyer: getAddress(buyer),
      rulesHash: rulesHash as Hex,
      publicCeilingXrp,
    };
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
    try {
      await this.publicClient.simulateContract({
        account: writer.account,
        address: assetManager,
      abi: assetManagerFAssetsAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, userOperationData],
      value,
      gas: SMART_ACCOUNT_DIRECT_MINT_GAS_LIMIT,
      });
    } catch (error) {
      throw new Error(directMintFailureCode(error));
    }
    let hash: Hex;
    try {
      hash = await writer.walletClient.writeContract({
        account: writer.account,
        address: assetManager,
        abi: assetManagerFAssetsAbi,
        functionName: "executeDirectMintingWithData",
        args: [proof, userOperationData],
        value,
        gas: SMART_ACCOUNT_DIRECT_MINT_GAS_LIMIT,
      });
    } catch (error) {
      throw new Error(directMintFailureCode(error));
    }
    return receipt(await this.publicClient.waitForTransactionReceipt({ hash }));
  }
}
