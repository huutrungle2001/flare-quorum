import { createViemHandleClient } from "@iexec-nox/handle";
import type {
  Eip1193Provider as SafeEip1193Provider,
} from "@safe-global/protocol-kit";
import factoryAbiJson from "@flarequorum/chain-bindings/abis/VeilBidSafeModuleFactory";
import marketAbiJson from "@flarequorum/chain-bindings/abis/VeilBidMarket";
import moduleAbiJson from "@flarequorum/chain-bindings/abis/VeilBidSafePreparationModule";
import unwrapPreparationAbiJson from "@flarequorum/chain-bindings/abis/VeilBidSafeUnwrapPreparation";
import tokenAbiJson from "@flarequorum/chain-bindings/abis/VeilBidTestUSDC";
import wrapperAbiJson from "@flarequorum/chain-bindings/abis/VeilBidConfidentialUSDC";
import deployment from "@flarequorum/chain-bindings/addresses/sepolia.release";
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  maxUint48,
  parseUnits,
  toHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { createResilientSepoliaClient } from "../chain/sepoliaRpc";
import { defaultSepoliaRpcUrl } from "../public-market/loadPublicMarket";
import {
  readWalletBalances,
  type WalletBalances,
} from "../wallet/WalletBalancePanel";

const factoryAbi = factoryAbiJson as Abi;
const marketAbi = marketAbiJson as Abi;
const moduleAbi = moduleAbiJson as Abi;
const unwrapPreparationAbi = unwrapPreparationAbiJson as Abi;
const tokenAbi = tokenAbiJson as Abi;
const wrapperAbi = wrapperAbiJson as Abi;
const marketAddress = deployment.contracts.VeilBidMarket.address as Address;
const tokenAddress = deployment.contracts.VeilBidTestUSDC.address as Address;
const wrapperAddress = deployment.contracts
  .VeilBidConfidentialUSDC.address as Address;
export const noxComputeAddress =
  "0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF" as Address;
const legacyModuleAddress =
  deployment.contracts.VeilBidSafePreparationModule.address as Address;
const demoSafeAddress = deployment.contracts.VeilBidDemoSafe.address as Address;
export const safeTransactionServiceUrl =
  "https://safe-transaction-sepolia.safe.global/api";
const safeReadAbi = [
  {
    type: "function",
    name: "isOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isModuleEnabled",
    stateMutability: "view",
    inputs: [{ name: "module", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "enableModule",
    stateMutability: "nonpayable",
    inputs: [{ name: "module", type: "address" }],
    outputs: [],
  },
] as const;
const noxAclAbi = [
  {
    type: "function",
    name: "addViewer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "handle", type: "bytes32" },
      { name: "viewer", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isViewer",
    stateMutability: "view",
    inputs: [
      { name: "handle", type: "bytes32" },
      { name: "viewer", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
const safeExecutionSuccessTopic = keccak256(
  toHex("ExecutionSuccess(bytes32,uint256)"),
);
const safeExecutionFailureTopic = keccak256(
  toHex("ExecutionFailure(bytes32,uint256)"),
);

type ReleaseContracts = typeof deployment.contracts & {
  VeilBidSafeModuleFactory?: { address?: string };
  VeilBidSafeUnwrapPreparation?: { address?: string };
};

export const safeReleaseConfiguration = {
  safe: demoSafeAddress,
  module: legacyModuleAddress,
  moduleEnabled:
    deployment.contracts.VeilBidSafePreparationModule.enabled === true,
  walletUrl: safeWalletUrl(demoSafeAddress),
} as const;

export interface SafeTenderInput {
  metadata: string;
  ceiling: string;
  deadline: string;
  vendors: string;
}

export interface SafeBatchTransaction {
  to: Address;
  value: string;
  data: Hex;
}

export interface SafeExecutionLog {
  address: Address;
  topics: readonly Hex[];
}

export type SafeActionKind =
  | "setup"
  | "fund"
  | "tender"
  | "view-balance"
  | "withdraw-eth"
  | "withdraw-usdc"
  | "unwrap";

export interface SafePreparationResult {
  kind: SafeActionKind;
  actionHash: Hex | null;
  safe: Address;
  target: Address;
  safeTransactionData: Hex;
  preparationTransactionData: Hex | null;
  transactions: readonly SafeBatchTransaction[];
  safeTxHash: Hex;
  threshold: number;
  confirmations: number;
  executed: boolean;
  executionTransactionHash: Hex | null;
}

export interface SafeProposalStatus {
  safeTxHash: Hex;
  threshold: number;
  confirmations: number;
  executed: boolean;
  executionTransactionHash: Hex | null;
}

export interface SafeAccountConfiguration {
  safe: Address;
  owners: readonly Address[];
  threshold: number;
  connectedOwner: boolean;
  factory: Address | null;
  module: Address | null;
  moduleDeployed: boolean;
  moduleEnabled: boolean;
  marketConfigured: boolean;
  marketAuthorized: boolean;
  legacyModule: boolean;
  balances: WalletBalances;
  confidentialViewerAuthorized: boolean;
  ready: boolean;
}

export interface SafeUnwrapRequest {
  executionTransactionHash: Hex;
  receiver: Address;
  requestHandle: Hex;
  finalized: boolean;
}

export interface SafeUnwrapFinalization {
  transactionHash: Hex;
  plaintextAmount: bigint;
}

export interface PersonalSafeDeployment {
  safe: Address;
  deploymentTransactionHash: Hex;
}

export interface WalletSafeDepositResult {
  safe: Address;
  amount: bigint;
  approvalTransactionHash: Hex | null;
  depositTransactionHash: Hex;
}

export function safeWalletUrl(safe: Address) {
  return `https://app.safe.global/home?safe=sep:${safe}`;
}

export function assertSafeBatchExecution(
  safe: Address,
  logs: readonly SafeExecutionLog[],
) {
  const safeLogs = logs.filter(
    (log) => log.address.toLowerCase() === safe.toLowerCase(),
  );
  if (
    safeLogs.some(
      (log) =>
        log.topics[0]?.toLowerCase() ===
        safeExecutionFailureTopic.toLowerCase(),
    )
  ) {
    throw new Error("Safe rejected the internal batch execution.");
  }
  if (
    !safeLogs.some(
      (log) =>
        log.topics[0]?.toLowerCase() ===
        safeExecutionSuccessTopic.toLowerCase(),
    )
  ) {
    throw new Error("Safe execution result could not be confirmed.");
  }
}

export function configuredFactoryAddress(): Address | null {
  const manifestAddress = (deployment.contracts as ReleaseContracts)
    .VeilBidSafeModuleFactory?.address;
  const configured =
    import.meta.env.VITE_SAFE_MODULE_FACTORY_ADDRESS?.trim() || manifestAddress;
  return configured && isAddress(configured) ? getAddress(configured) : null;
}

export function configuredUnwrapPreparationAddress(): Address | null {
  const manifestAddress = (deployment.contracts as ReleaseContracts)
    .VeilBidSafeUnwrapPreparation?.address;
  const configured =
    import.meta.env.VITE_SAFE_UNWRAP_PREPARATION_ADDRESS?.trim() ||
    manifestAddress;
  return configured && isAddress(configured) ? getAddress(configured) : null;
}

export async function createSafeApiKit() {
  const { default: SafeApiKit } = await import("@safe-global/api-kit");
  const apiKey = import.meta.env.VITE_SAFE_TRANSACTION_SERVICE_API_KEY?.trim();
  return new SafeApiKit(
    apiKey
      ? { chainId: BigInt(sepolia.id), apiKey }
      : {
          chainId: BigInt(sepolia.id),
          txServiceUrl: safeTransactionServiceUrl,
        },
  );
}

async function protocolKit(
  provider: EIP1193Provider,
  account: Address,
  safe: Address,
) {
  const { default: Safe } = await import("@safe-global/protocol-kit");
  return Safe.init({
    provider: provider as SafeEip1193Provider,
    signer: account,
    safeAddress: safe,
  });
}

export async function deployPersonalSafe({
  provider,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  provider: EIP1193Provider;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}): Promise<PersonalSafeDeployment> {
  const { default: Safe } = await import("@safe-global/protocol-kit");
  const entropy = crypto.getRandomValues(new Uint8Array(32));
  const saltNonce = BigInt(toHex(entropy)).toString();
  onStage("Predicting a new Safe 1/1 address");
  const predictedSafe = await Safe.init({
    provider: provider as SafeEip1193Provider,
    signer: account,
    predictedSafe: {
      safeAccountConfig: {
        owners: [account],
        threshold: 1,
      },
      safeDeploymentConfig: {
        safeVersion: "1.4.1",
        saltNonce,
      },
    },
  });
  const safe = getAddress(await predictedSafe.getAddress());
  const existingClient = createResilientSepoliaClient(rpcUrl);
  const existingCode = await existingClient.getBytecode({ address: safe });
  if (existingCode && existingCode !== "0x") {
    throw new Error("Predicted Safe address is already deployed. Try again.");
  }

  onStage("Awaiting wallet approval to deploy the Safe");
  const deploymentTransaction =
    await predictedSafe.createSafeDeploymentTransaction();
  const deploymentTransactionHash = await walletClient.sendTransaction({
    account,
    chain: sepolia,
    data: deploymentTransaction.data as Hex,
    to: getAddress(deploymentTransaction.to),
    value: BigInt(deploymentTransaction.value),
  });
  onStage("Waiting for the Safe deployment confirmation");
  const receipt = await existingClient.waitForTransactionReceipt({
    hash: deploymentTransactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error("Safe deployment transaction reverted.");
  }
  const deployedCode = await existingClient.getBytecode({ address: safe });
  if (!deployedCode || deployedCode === "0x") {
    throw new Error("Safe deployment confirmed without runtime code.");
  }
  return { safe, deploymentTransactionHash };
}

export async function discoverOwnerSafes(account: Address): Promise<Address[]> {
  const response = await (await createSafeApiKit()).getSafesByOwner(account);
  return response.safes
    .filter((safe) => isAddress(safe))
    .map((safe) => getAddress(safe));
}

export async function verifyOwnedSafes({
  account,
  safes,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  account: Address;
  safes: readonly Address[];
  rpcUrl?: string;
}): Promise<Address[]> {
  const client = createResilientSepoliaClient(rpcUrl);
  const uniqueSafes = [...new Map(
    safes.map((safe) => [safe.toLowerCase(), getAddress(safe)]),
  ).values()];
  const ownership = await Promise.all(
    uniqueSafes.map(async (safe) => {
      try {
        const [code, isOwner] = await Promise.all([
          client.getBytecode({ address: safe }),
          client.readContract({
            address: safe,
            abi: safeReadAbi,
            functionName: "isOwner",
            args: [account],
          }),
        ]);
        return code && code !== "0x" && isOwner ? safe : null;
      } catch {
        return null;
      }
    }),
  );
  return ownership.filter((safe): safe is Address => safe !== null);
}

export async function inspectSafeConfiguration({
  safe,
  account,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  safe: Address;
  account: Address;
  rpcUrl?: string;
}): Promise<SafeAccountConfiguration> {
  const client = createResilientSepoliaClient(rpcUrl);
  const bytecode = await client.getBytecode({ address: safe });
  if (!bytecode || bytecode === "0x") {
    throw new Error("The selected address is not a deployed Sepolia Safe.");
  }
  const [ownersResult, thresholdResult, connectedOwner, balances] =
    await Promise.all([
      client.readContract({
        address: safe,
        abi: safeReadAbi,
        functionName: "getOwners",
      }),
      client.readContract({
        address: safe,
        abi: safeReadAbi,
        functionName: "getThreshold",
      }),
      client.readContract({
        address: safe,
        abi: safeReadAbi,
        functionName: "isOwner",
        args: [account],
      }),
      readWalletBalances(safe, rpcUrl),
    ]);
  const owners = (ownersResult as Address[]).map(getAddress);
  const threshold = Number(thresholdResult);
  if (!connectedOwner) {
    throw new Error("Connected wallet is not an owner of the selected Safe.");
  }

  const configuredFactory = configuredFactoryAddress();
  const factoryBytecode = configuredFactory
    ? await client.getBytecode({ address: configuredFactory })
    : null;
  const factory =
    configuredFactory && factoryBytecode && factoryBytecode !== "0x"
      ? configuredFactory
      : null;
  let module: Address | null = null;
  let legacyModule = false;

  if (factory) {
    const [registered, predicted] = await Promise.all([
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "moduleOf",
        args: [safe],
      }),
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "predictModule",
        args: [safe],
      }),
    ]);
    if (registered !== zeroAddress) {
      module = getAddress(registered as Address);
    } else if (safe.toLowerCase() === demoSafeAddress.toLowerCase()) {
      module = legacyModuleAddress;
      legacyModule = true;
    } else {
      module = getAddress(predicted as Address);
    }
  } else if (safe.toLowerCase() === demoSafeAddress.toLowerCase()) {
    module = legacyModuleAddress;
    legacyModule = true;
  }

  const moduleBytecode = module
    ? await client.getBytecode({ address: module })
    : null;
  const moduleDeployed = Boolean(moduleBytecode && moduleBytecode !== "0x");
  const [moduleEnabled, configuredMarket, marketAuthorized] =
    module && moduleDeployed
      ? await Promise.all([
          client.readContract({
            address: safe,
            abi: safeReadAbi,
            functionName: "isModuleEnabled",
            args: [module],
          }) as Promise<boolean>,
          client.readContract({
            address: module,
            abi: moduleAbi,
            functionName: "market",
          }) as Promise<Address>,
          client.readContract({
            address: wrapperAddress,
            abi: wrapperAbi,
            functionName: "isOperator",
            args: [safe, marketAddress],
          }) as Promise<boolean>,
        ])
      : [false, zeroAddress, false] as const;
  const marketConfigured =
    configuredMarket.toLowerCase() === marketAddress.toLowerCase();
  const confidentialViewerAuthorized = balances.confidentialHandle
    ? await client.readContract({
        address: noxComputeAddress,
        abi: noxAclAbi,
        functionName: "isViewer",
        args: [balances.confidentialHandle, account],
      }).catch(() => false)
    : false;

  return {
    safe,
    owners,
    threshold,
    connectedOwner: true,
    factory,
    module,
    moduleDeployed,
    moduleEnabled,
    marketConfigured,
    marketAuthorized,
    legacyModule,
    balances,
    confidentialViewerAuthorized,
    ready:
      moduleDeployed &&
      moduleEnabled &&
      marketConfigured &&
      marketAuthorized,
  };
}

export function parseSafeTenderInput(input: SafeTenderInput) {
  const metadata = input.metadata.trim();
  if (!metadata) throw new Error("Metadata is required.");
  const publicCeiling = parseUnits(input.ceiling, 6);
  if (publicCeiling <= 0n) throw new Error("Ceiling must be positive.");
  const bidDeadlineMilliseconds = new Date(input.deadline).getTime();
  if (
    !Number.isFinite(bidDeadlineMilliseconds) ||
    bidDeadlineMilliseconds <= Date.now() + 60_000
  ) {
    throw new Error("Deadline must be at least one minute in the future.");
  }
  const bidDeadline = BigInt(Math.floor(bidDeadlineMilliseconds / 1_000));
  const approvedVendors = input.vendors
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    approvedVendors.length < 1 ||
    approvedVendors.length > 8 ||
    approvedVendors.some((value) => !isAddress(value)) ||
    new Set(approvedVendors.map((value) => value.toLowerCase())).size !==
      approvedVendors.length
  ) {
    throw new Error("Provide 1–8 unique vendor addresses.");
  }
  return {
    metadataHash: keccak256(toHex(metadata)),
    publicCeiling,
    bidDeadline,
    approvedVendors: approvedVendors as Address[],
  };
}

export function assertSafeCeilingWithinRevealedBalance(
  publicCeiling: bigint,
  revealedBalance: bigint | null,
) {
  if (revealedBalance === null) {
    throw new Error(
      "Reveal the current Safe vcUSDC balance before creating a tender.",
    );
  }
  if (publicCeiling > revealedBalance) {
    throw new Error(
      "Public ceiling exceeds the available Safe vcUSDC balance.",
    );
  }
}

async function unusedPreparationNonce({
  module,
  rpcUrl,
}: {
  module: Address;
  rpcUrl: string;
}) {
  const client = createResilientSepoliaClient(rpcUrl);
  const seed = BigInt(`0x${crypto.getRandomValues(new Uint8Array(16))
    .reduce((hex, byte) => `${hex}${byte.toString(16).padStart(2, "0")}`, "")}`);
  for (let offset = 0n; offset < 16n; offset += 1n) {
    const nonce = seed + offset + 1n;
    const used = await client.readContract({
      address: module,
      abi: moduleAbi,
      functionName: "usedNonces",
      args: [nonce],
    });
    if (!used) return nonce;
  }
  throw new Error("Could not allocate a fresh Safe preparation nonce.");
}

async function unusedSafeUnwrapNonce({
  preparation,
  safe,
  rpcUrl,
}: {
  preparation: Address;
  safe: Address;
  rpcUrl: string;
}) {
  const client = createResilientSepoliaClient(rpcUrl);
  const seed = BigInt(
    `0x${crypto
      .getRandomValues(new Uint8Array(16))
      .reduce(
        (hex, byte) => `${hex}${byte.toString(16).padStart(2, "0")}`,
        "",
      )}`,
  );
  for (let offset = 0n; offset < 16n; offset += 1n) {
    const nonce = seed + offset + 1n;
    const used = await client.readContract({
      address: preparation,
      abi: unwrapPreparationAbi,
      functionName: "usedNonces",
      args: [safe, nonce],
    });
    if (!used) return nonce;
  }
  throw new Error("Could not allocate a fresh Safe unwrap nonce.");
}

async function proposeSafeBatch({
  kind,
  safe,
  transactions,
  provider,
  account,
  onStage,
  actionHash = null,
  target = transactions[transactions.length - 1]?.to ?? safe,
  safeTransactionData = transactions[transactions.length - 1]?.data ?? "0x",
  preparationTransactionData = null,
  rpcUrl,
}: {
  kind: SafeActionKind;
  safe: Address;
  transactions: readonly SafeBatchTransaction[];
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  actionHash?: Hex | null;
  target?: Address;
  safeTransactionData?: Hex;
  preparationTransactionData?: Hex | null;
  rpcUrl: string;
}): Promise<SafePreparationResult> {
  if (transactions.length === 0) throw new Error("Safe batch is empty.");
  const safeKit = await protocolKit(provider, account, safe);
  if (!(await safeKit.isOwner(account))) {
    throw new Error("Connected wallet is not an owner of the selected Safe.");
  }
  const apiKit = await createSafeApiKit();
  let nextNonce: number | undefined;
  try {
    nextNonce = Number(await apiKit.getNextNonce(safe));
  } catch {
    nextNonce = await safeKit.getNonce();
  }
  onStage("Building the Safe transaction");
  const safeTransaction = await safeKit.createTransaction({
    transactions: [...transactions],
    options: { nonce: nextNonce },
  });
  const safeTxHash = (await safeKit.getTransactionHash(safeTransaction)) as Hex;

  onStage("Awaiting one Safe owner approval");
  const signedTransaction = await safeKit.signTransaction(safeTransaction);
  const senderSignature = signedTransaction.getSignature(account)?.data;
  if (!senderSignature) throw new Error("Safe owner signature was not produced.");

  onStage("Publishing proposal to Safe Transaction Service");
  await apiKit.proposeTransaction({
    safeAddress: safe,
    safeTransactionData: signedTransaction.data,
    safeTxHash,
    senderAddress: account,
    senderSignature,
    origin: `FlareQuorum Safe ${kind}`,
  });

  const threshold = await safeKit.getThreshold();
  let executionTransactionHash: Hex | null = null;
  if (threshold === 1) {
    onStage("Threshold reached; awaiting the execution transaction");
    const execution = await safeKit.executeTransaction(signedTransaction);
    executionTransactionHash = execution.hash as Hex;
    onStage("Safe batch submitted; waiting for Sepolia confirmation");
    const publicClient = createResilientSepoliaClient(rpcUrl);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: executionTransactionHash,
    });
    if (receipt.status !== "success") throw new Error("Safe batch reverted.");
    assertSafeBatchExecution(safe, receipt.logs);
  }

  return {
    kind,
    actionHash,
    safe,
    target,
    safeTransactionData,
    preparationTransactionData,
    transactions,
    safeTxHash,
    threshold,
    confirmations: 1,
    executed: threshold === 1,
    executionTransactionHash,
  };
}

export async function setupSafeForFlareQuorum({
  configuration,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  const { safe, factory, module } = configuration;
  if (!module) {
    throw new Error("The Safe module factory is not deployed or configured.");
  }
  const transactions: SafeBatchTransaction[] = [];
  if (!configuration.moduleDeployed) {
    if (!factory) throw new Error("Module factory is required for this Safe.");
    transactions.push({
      to: factory,
      value: "0",
      data: encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployModule",
        args: [safe],
      }),
    });
  }
  if (!configuration.moduleEnabled) {
    transactions.push({
      to: safe,
      value: "0",
      data: encodeFunctionData({
        abi: safeReadAbi,
        functionName: "enableModule",
        args: [module],
      }),
    });
  }
  if (!configuration.marketConfigured) {
    transactions.push({
      to: module,
      value: "0",
      data: encodeFunctionData({
        abi: moduleAbi,
        functionName: "configureMarket",
        args: [marketAddress],
      }),
    });
  }
  if (!configuration.marketAuthorized) {
    transactions.push({
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperAbi,
        functionName: "setOperator",
        args: [marketAddress, maxUint48],
      }),
    });
  }
  if (transactions.length === 0) {
    throw new Error("This Safe is already configured for FlareQuorum.");
  }
  return proposeSafeBatch({
    kind: "setup",
    safe,
    transactions,
    provider,
    account,
    onStage,
    rpcUrl,
  });
}

export function buildWalletSafeDepositTransactions(
  safe: Address,
  amount: bigint,
) {
  if (amount <= 0n) throw new Error("Deposit amount must be positive.");
  return [
    {
      to: tokenAddress,
      value: "0",
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "approve",
        args: [wrapperAddress, amount],
      }),
    },
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperAbi,
        functionName: "wrap",
        args: [safe, amount],
      }),
    },
  ] as const satisfies readonly SafeBatchTransaction[];
}

export async function depositWalletTestUsdcToSafe({
  safe,
  amount,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  safe: Address;
  amount: bigint;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}): Promise<WalletSafeDepositResult> {
  if (amount <= 0n) throw new Error("Deposit amount must be positive.");
  const publicClient = createResilientSepoliaClient(rpcUrl);
  onStage("Checking wallet vUSDC balance and wrapper allowance");
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account],
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "allowance",
      args: [account, wrapperAddress],
    }),
  ]);
  if (typeof balance !== "bigint" || balance < amount) {
    throw new Error(
      "Insufficient wallet vUSDC. Use GET TEST USDC in the wallet balance panel first.",
    );
  }
  if (typeof allowance !== "bigint") {
    throw new Error("Wallet vUSDC allowance response is malformed.");
  }

  const transact = async (
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ) => {
    const simulation = await publicClient.simulateContract({
      account,
      address,
      abi,
      functionName,
      args,
    });
    const hash = await walletClient.writeContract(simulation.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} transaction reverted.`);
    }
    return hash;
  };

  let approvalTransactionHash: Hex | null = null;
  if (allowance < amount) {
    onStage("Approve the wrapper to use wallet vUSDC");
    approvalTransactionHash = await transact(
      tokenAddress,
      tokenAbi,
      "approve",
      [wrapperAddress, amount],
    );
  }
  onStage("Confirm the vcUSDC deposit to the selected Safe");
  const depositTransactionHash = await transact(
    wrapperAddress,
    wrapperAbi,
    "wrap",
    [safe, amount],
  );
  return {
    safe,
    amount,
    approvalTransactionHash,
    depositTransactionHash,
  };
}

export async function authorizeSafeBalanceViewer({
  configuration,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  const handle = configuration.balances.confidentialHandle;
  if (!handle) throw new Error("This Safe has no confidential balance handle.");
  if (configuration.confidentialViewerAuthorized) {
    throw new Error("Connected owner can already view this balance handle.");
  }
  const transaction = buildSafeBalanceViewerTransaction(handle, account);
  return proposeSafeBatch({
    kind: "view-balance",
    safe: configuration.safe,
    transactions: [transaction],
    provider,
    account,
    onStage,
    target: noxComputeAddress,
    safeTransactionData: transaction.data,
    rpcUrl,
  });
}

export async function revealSafeConfidentialBalance({
  configuration,
  walletClient,
}: {
  configuration: SafeAccountConfiguration;
  walletClient: WalletClient;
}) {
  const handle = configuration.balances.confidentialHandle;
  if (!handle) throw new Error("This Safe has no confidential balance handle.");
  if (!configuration.confidentialViewerAuthorized) {
    throw new Error(
      "Authorize this owner as a viewer for the current balance handle first.",
    );
  }
  const handles = await createViemHandleClient(walletClient);
  const revealed = await handles.decrypt(handle as never);
  if (typeof revealed.value !== "bigint") {
    throw new Error("Confidential Safe balance response is malformed.");
  }
  return revealed.value;
}

export function buildSafeBalanceViewerTransaction(
  handle: Hex,
  viewer: Address,
): SafeBatchTransaction {
  return {
    to: noxComputeAddress,
    value: "0",
    data: encodeFunctionData({
      abi: noxAclAbi,
      functionName: "addViewer",
      args: [handle, viewer],
    }),
  };
}

export function buildSafeEthWithdrawalTransaction(
  recipient: Address,
  amount: bigint,
): SafeBatchTransaction {
  return { to: recipient, value: amount.toString(), data: "0x" };
}

export function buildSafeTestUsdcWithdrawalTransaction(
  recipient: Address,
  amount: bigint,
): SafeBatchTransaction {
  return {
    to: tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [recipient, amount],
    }),
  };
}

export function buildFullSafeUnwrapTransaction(
  safe: Address,
  recipient: Address,
  handle: Hex,
): SafeBatchTransaction {
  return {
    to: wrapperAddress,
    value: "0",
    data: encodeFunctionData({
      abi: wrapperAbi,
      functionName: "unwrap",
      args: [safe, recipient, handle],
    }),
  };
}

export function buildPartialSafeUnwrapTransactions({
  preparation,
  safe,
  recipient,
  encryptedAmountHandle,
  inputProof,
  inputOwner,
  expectedBalanceHandle,
  nonce,
}: {
  preparation: Address;
  safe: Address;
  recipient: Address;
  encryptedAmountHandle: Hex;
  inputProof: Hex;
  inputOwner: Address;
  expectedBalanceHandle: Hex;
  nonce: bigint;
}): readonly [SafeBatchTransaction, SafeBatchTransaction] {
  return [
    {
      to: preparation,
      value: "0",
      data: encodeFunctionData({
        abi: unwrapPreparationAbi,
        functionName: "preparePartialUnwrap",
        args: [
          encryptedAmountHandle,
          inputProof,
          inputOwner,
          expectedBalanceHandle,
          nonce,
        ],
      }),
    },
    {
      to: wrapperAddress,
      value: "0",
      data: encodeFunctionData({
        abi: wrapperAbi,
        functionName: "unwrap",
        args: [safe, recipient, encryptedAmountHandle],
      }),
    },
  ];
}

export async function withdrawSafeEth({
  configuration,
  recipient,
  amount,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  recipient: Address;
  amount: bigint;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  if (amount <= 0n) throw new Error("ETH withdrawal amount must be positive.");
  if (amount > configuration.balances.eth) {
    throw new Error("ETH withdrawal exceeds the Safe balance.");
  }
  return proposeSafeBatch({
    kind: "withdraw-eth",
    safe: configuration.safe,
    transactions: [buildSafeEthWithdrawalTransaction(recipient, amount)],
    provider,
    account,
    onStage,
    target: recipient,
    safeTransactionData: "0x",
    rpcUrl,
  });
}

export async function withdrawSafeTestUsdc({
  configuration,
  recipient,
  amount,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  recipient: Address;
  amount: bigint;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  if (amount <= 0n) throw new Error("vUSDC withdrawal amount must be positive.");
  if (amount > configuration.balances.testUsdc) {
    throw new Error("vUSDC withdrawal exceeds the Safe balance.");
  }
  const transaction = buildSafeTestUsdcWithdrawalTransaction(recipient, amount);
  return proposeSafeBatch({
    kind: "withdraw-usdc",
    safe: configuration.safe,
    transactions: [transaction],
    provider,
    account,
    onStage,
    target: tokenAddress,
    safeTransactionData: transaction.data,
    rpcUrl,
  });
}

export async function unwrapFullSafeConfidentialBalance({
  configuration,
  recipient,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  recipient: Address;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  const handle = configuration.balances.confidentialHandle;
  if (!handle) throw new Error("This Safe has no confidential balance to unwrap.");
  const transaction = buildFullSafeUnwrapTransaction(
    configuration.safe,
    recipient,
    handle,
  );
  return proposeSafeBatch({
    kind: "unwrap",
    safe: configuration.safe,
    transactions: [transaction],
    provider,
    account,
    onStage,
    target: wrapperAddress,
    safeTransactionData: transaction.data,
    rpcUrl,
  });
}

export async function unwrapPartialSafeConfidentialBalance({
  configuration,
  recipient,
  amount,
  revealedBalance,
  walletClient,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  configuration: SafeAccountConfiguration;
  recipient: Address;
  amount: bigint;
  revealedBalance: bigint;
  walletClient: WalletClient;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  const expectedBalanceHandle =
    configuration.balances.confidentialHandle;
  if (!expectedBalanceHandle) {
    throw new Error("This Safe has no confidential balance to unwrap.");
  }
  if (amount <= 0n) {
    throw new Error("Custom unwrap amount must be positive.");
  }
  if (revealedBalance <= 0n || amount >= revealedBalance) {
    throw new Error(
      "Custom unwrap must be smaller than the revealed balance. Use Full for the entire balance.",
    );
  }
  const preparation = configuredUnwrapPreparationAddress();
  if (!preparation) {
    throw new Error("Safe partial unwrap preparation is unavailable.");
  }
  const nonce = await unusedSafeUnwrapNonce({
    preparation,
    safe: configuration.safe,
    rpcUrl,
  });
  onStage("Encrypting the custom unwrap amount");
  const handles = await createViemHandleClient(walletClient);
  const encrypted = await handles.encryptInput(
    amount,
    "uint256",
    preparation,
  );
  const transactions = buildPartialSafeUnwrapTransactions({
    preparation,
    safe: configuration.safe,
    recipient,
    encryptedAmountHandle: encrypted.handle,
    inputProof: encrypted.handleProof,
    inputOwner: account,
    expectedBalanceHandle,
    nonce,
  });
  return proposeSafeBatch({
    kind: "unwrap",
    safe: configuration.safe,
    transactions,
    provider,
    account,
    onStage,
    target: wrapperAddress,
    safeTransactionData: transactions[1].data,
    preparationTransactionData: transactions[0].data,
    rpcUrl,
  });
}

export async function findSafeUnwrapRequest(
  executionTransactionHash: Hex,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
): Promise<SafeUnwrapRequest> {
  const client = createResilientSepoliaClient(rpcUrl);
  const receipt = await client.getTransactionReceipt({
    hash: executionTransactionHash,
  });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== wrapperAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: wrapperAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "UnwrapRequested") continue;
      const args = decoded.args as unknown as {
        receiver: Address;
        amount: Hex;
      };
      const requester = await client.readContract({
        address: wrapperAddress,
        abi: wrapperAbi,
        functionName: "unwrapRequester",
        args: [args.amount],
      });
      return {
        executionTransactionHash,
        receiver: getAddress(args.receiver),
        requestHandle: args.amount,
        finalized:
          (requester as Address).toLowerCase() === zeroAddress.toLowerCase(),
      };
    } catch {
      // Ignore unrelated wrapper events in the Safe execution receipt.
    }
  }
  throw new Error("The executed Safe transaction has no unwrap request event.");
}

export async function finalizeSafeUnwrap({
  requestHandle,
  walletClient,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  requestHandle: Hex;
  walletClient: WalletClient;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}): Promise<SafeUnwrapFinalization> {
  const client = createResilientSepoliaClient(rpcUrl);
  const requester = await client.readContract({
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "unwrapRequester",
    args: [requestHandle],
  });
  if ((requester as Address).toLowerCase() === zeroAddress.toLowerCase()) {
    throw new Error("This unwrap request has already been finalized.");
  }
  onStage("Waiting for the public unwrap proof");
  const handles = await createViemHandleClient(walletClient);
  const revealed = await handles.publicDecrypt(requestHandle as never);
  if (typeof revealed.value !== "bigint") {
    throw new Error("Public unwrap amount response is malformed.");
  }
  onStage("Awaiting wallet confirmation to finalize the unwrap");
  const simulation = await client.simulateContract({
    account,
    address: wrapperAddress,
    abi: wrapperAbi,
    functionName: "finalizeUnwrap",
    args: [requestHandle, revealed.decryptionProof],
  });
  const transactionHash = await walletClient.writeContract(simulation.request);
  onStage("Waiting for the unwrap finalization confirmation");
  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (receipt.status !== "success") {
    throw new Error("Unwrap finalization reverted.");
  }
  return {
    transactionHash,
    plaintextAmount: revealed.value,
  };
}

export async function prepareSafeTender({
  input,
  configuration,
  walletClient,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  input: SafeTenderInput;
  configuration: SafeAccountConfiguration;
  walletClient: WalletClient;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}) {
  if (!configuration.ready || !configuration.module) {
    throw new Error("Configure this Safe for FlareQuorum before creating a tender.");
  }
  const terms = parseSafeTenderInput(input);
  const publicClient = createResilientSepoliaClient(rpcUrl);
  const nonce = await unusedPreparationNonce({
    module: configuration.module,
    rpcUrl,
  });
  const actionDataHash = (await publicClient.readContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "hashTenderAction",
    args: [
      configuration.safe,
      account,
      terms.metadataHash,
      terms.publicCeiling,
      terms.bidDeadline,
      terms.approvedVendors,
    ],
  })) as Hex;
  const actionHash = (await publicClient.readContract({
    address: configuration.module,
    abi: moduleAbi,
    functionName: "computeActionHash",
    args: [actionDataHash, nonce],
  })) as Hex;

  onStage("Encrypting budget for the selected Safe module");
  const handles = await createViemHandleClient(walletClient);
  const encrypted = await handles.encryptInput(
    terms.publicCeiling,
    "uint256",
    configuration.module,
  );
  const preparationTransactionData = encodeFunctionData({
    abi: moduleAbi,
    functionName: "prepareInputForSafe",
    args: [
      encrypted.handle,
      encrypted.handleProof,
      account,
      marketAddress,
      actionDataHash,
      actionHash,
      nonce,
    ],
  });
  const safeTransactionData = encodeFunctionData({
    abi: marketAbi,
    functionName: "createTenderAuthorized",
    args: [
      terms.metadataHash,
      terms.publicCeiling,
      terms.bidDeadline,
      terms.approvedVendors,
      account,
      configuration.module,
      nonce,
    ],
  });
  const transactions: SafeBatchTransaction[] = [
    {
      to: configuration.module,
      value: "0",
      data: preparationTransactionData,
    },
    { to: marketAddress, value: "0", data: safeTransactionData },
  ];

  return proposeSafeBatch({
    kind: "tender",
    safe: configuration.safe,
    transactions,
    provider,
    account,
    onStage,
    actionHash,
    target: marketAddress,
    safeTransactionData,
    preparationTransactionData,
    rpcUrl,
  });
}

export async function getSafeProposalStatus(
  safeTxHash: Hex,
): Promise<SafeProposalStatus> {
  const transaction = await (await createSafeApiKit()).getTransaction(safeTxHash);
  return {
    safeTxHash,
    threshold: transaction.confirmationsRequired,
    confirmations: transaction.confirmations?.length ?? 0,
    executed: transaction.isExecuted,
    executionTransactionHash:
      (transaction.transactionHash as Hex | null) ?? null,
  };
}

export async function approveAndExecuteSafeProposal({
  safe,
  safeTxHash,
  provider,
  account,
  onStage,
  rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL ?? defaultSepoliaRpcUrl,
}: {
  safe: Address;
  safeTxHash: Hex;
  provider: EIP1193Provider;
  account: Address;
  onStage: (stage: string) => void;
  rpcUrl?: string;
}): Promise<SafeProposalStatus> {
  const safeKit = await protocolKit(provider, account, safe);
  if (!(await safeKit.isOwner(account))) {
    throw new Error("Connected wallet is not an owner of the selected Safe.");
  }
  const apiKit = await createSafeApiKit();
  let transaction = await apiKit.getTransaction(safeTxHash);
  if (transaction.safe.toLowerCase() !== safe.toLowerCase()) {
    throw new Error("Safe proposal does not belong to the selected Safe.");
  }
  const alreadyConfirmed = transaction.confirmations?.some(
    ({ owner }) => owner.toLowerCase() === account.toLowerCase(),
  );
  if (!alreadyConfirmed) {
    onStage("Awaiting Safe owner approval");
    const signature = await safeKit.signHash(safeTxHash);
    await apiKit.confirmTransaction(safeTxHash, signature.data);
    transaction = await apiKit.getTransaction(safeTxHash);
  }
  const confirmations = transaction.confirmations?.length ?? 0;
  if (!transaction.isExecuted && confirmations >= transaction.confirmationsRequired) {
    onStage("Threshold reached; awaiting the execution transaction");
    const execution = await safeKit.executeTransaction(transaction);
    const executionTransactionHash = execution.hash as Hex;
    const publicClient = createResilientSepoliaClient(rpcUrl);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: executionTransactionHash,
    });
    if (receipt.status !== "success") throw new Error("Safe batch reverted.");
    assertSafeBatchExecution(safe, receipt.logs);
    return {
      safeTxHash,
      threshold: transaction.confirmationsRequired,
      confirmations,
      executed: true,
      executionTransactionHash,
    };
  }
  return getSafeProposalStatus(safeTxHash);
}

export function serializeSafeTransactionHandoff(
  result: Pick<SafePreparationResult, "transactions">,
): string {
  return JSON.stringify(result.transactions, null, 2);
}
