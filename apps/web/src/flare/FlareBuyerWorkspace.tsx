import {
  buildMintAndFundPlan,
  calculateFlareRulesHash,
  coston2FlarePublicRelease,
  assetManagerFAssetsAbi,
  quoteSmartAccountDirectMinting,
  smartAccountReaderAbi,
  flareQuorumFlareMarketAbi,
  type FlareTenderTerms,
} from "@flarequorum/flare-bindings";
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletPanel } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";
import { useEffect, useState } from "react";
import { FlareXrpFundingPanel, type XrpFundingPrepareInput, type XrpFundingPreview } from "./FlareXrpFundingPanel";
import { clearBuyerPublicDraft, readBuyerPublicDraft, saveBuyerPublicDraft } from "./buyerPublicDraft";

const coston2 = {
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
} as const;

const erc20Abi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const maxApprovedVendors = 8;

function vendorRowErrors(values: readonly string[]): string[] {
  const errors = values.map(() => "");
  const seen = new Map<string, number>();
  values.forEach((rawValue, index) => {
    const value = rawValue.trim();
    if (!value) {
      errors[index] = "Enter a vendor address.";
      return;
    }
    if (!isAddress(value)) {
      errors[index] = "Enter a valid EVM address.";
      return;
    }
    const normalized = getAddress(value).toLowerCase();
    const previousIndex = seen.get(normalized);
    if (previousIndex !== undefined) {
      errors[previousIndex] ||= "Duplicate vendor address.";
      errors[index] = `Duplicate of vendor ${previousIndex + 1}.`;
      return;
    }
    seen.set(normalized, index);
  });
  return errors;
}

function parseVendors(values: readonly string[]): Address[] {
  if (values.length === 0 || values.length > maxApprovedVendors) throw new Error("Enter 1–8 approved vendor addresses.");
  const errors = vendorRowErrors(values);
  if (errors.some(Boolean)) throw new Error(errors.find(Boolean) ?? "Enter valid approved vendor addresses.");
  return values.map((value) => getAddress(value.trim()));
}

function parseCeiling(value: string): bigint {
  const normalized = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(normalized)) throw new Error("Enter a positive FTestXRP ceiling with at most 6 decimals.");
  const amount = parseUnits(normalized, 6);
  if (amount <= 0n) throw new Error("Ceiling must be above zero.");
  return amount;
}

function parseWeightPercent(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function weightTotalPercent(values: readonly string[]) {
  return values.reduce((total, value) => total + (parseWeightPercent(value) ?? 0), 0);
}

function weightValidationMessage(values: readonly string[]) {
  if (values.some((value) => parseWeightPercent(value) === null)) {
    return "Enter each weight as a whole percentage from 0% to 100%.";
  }
  const total = weightTotalPercent(values);
  return total === 100 ? null : `Weights must total 100% (currently ${total}%).`;
}

function parseWeight(value: string, label: string): number {
  const parsed = parseWeightPercent(value);
  if (parsed === null) throw new Error(`${label} weight must be a whole percentage from 0% to 100%.`);
  return parsed * 100;
}

function flareTenderErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause ?? "");
  const normalized = raw.toLowerCase();
  if (raw.includes("UserRejectedRequestError") || normalized.includes("user rejected") || normalized.includes("user denied")) {
    return "The wallet request was rejected.";
  }
  if (normalized.includes("insufficient funds")) return "This wallet needs more C2FLR for gas.";
  if (raw.includes("InvalidTokenTransfer")) return "This wallet does not have enough FTestXRP for the escrow ceiling.";
  if (raw.includes("NotRegisteredTee") || raw.includes("NotEnoughTeeIdentities")) {
    return "The Coston2 FCC identities are unavailable. Refresh state and try again.";
  }
  if (raw.includes("InvalidCodeVersion")) return "The Coston2 FCC extension binding is stale. Refresh state and try again.";
  if (raw.includes("InvalidScoringPolicy")) return "The tender scoring rules were rejected. Check the deadline and weight total.";
  if (raw.includes("InvalidTender")) return "The tender rules were rejected. Check the required fields and vendor list.";
  if (normalized.includes("http request failed") || normalized.includes("failed to fetch") || normalized.includes("rpcrequesterror")) {
    return "Coston2 RPC is temporarily unavailable. Try again in a moment.";
  }
  const message = raw.trim();
  return message.length > 280 ? `${message.slice(0, 277)}…` : message || "Tender creation failed on Coston2.";
}

export type FlareBuyerBriefCategory = "software" | "design" | "marketing" | "operations" | "research";
type FlareFundingMethod = "coston2" | "xrpl";

export interface FlareBuyerBriefInput {
  title: string;
  category: FlareBuyerBriefCategory;
  objective: string;
  acceptanceCriteria: string;
  vendorQuestions: string;
  bidDeadline: bigint;
  approvedVendors: readonly Address[];
}

/** Hash the public brief deterministically; the brief itself never contains bid data. */
export function hashFlareBuyerBrief(input: FlareBuyerBriefInput) {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    title: input.title.trim(),
    category: input.category,
    objective: input.objective.trim().replace(/\r\n/g, "\n"),
    acceptanceCriteria: input.acceptanceCriteria.trim().replace(/\r\n/g, "\n"),
    vendorQuestions: input.vendorQuestions.trim().replace(/\r\n/g, "\n"),
    asset: "FTestXRP",
    bidDeadline: input.bidDeadline.toString(),
    approvedVendors: input.approvedVendors.map((vendor) => vendor.toLowerCase()),
  });
  return keccak256(stringToHex(canonical));
}

interface BuyerFormValues {
  title: string;
  category: FlareBuyerBriefCategory;
  objective: string;
  acceptanceCriteria: string;
  vendorQuestions: string;
  ceiling: string;
  vendors: readonly string[];
  deadlineMinutes: string;
  priceWeight: string;
  deliveryWeight: string;
  warrantyWeight: string;
}

const defaultBuyerFormValues: BuyerFormValues = {
  title: "",
  category: "software",
  objective: "",
  acceptanceCriteria: "",
  vendorQuestions: "",
  ceiling: "1",
  vendors: [""],
  deadlineMinutes: "30",
  priceWeight: "60",
  deliveryWeight: "25",
  warrantyWeight: "15",
};

function hasMeaningfulBuyerDraft(input: BuyerFormValues) {
  return input.title.trim().length > 0
    || input.category !== defaultBuyerFormValues.category
    || input.objective.trim().length > 0
    || input.acceptanceCriteria.trim().length > 0
    || input.vendorQuestions.trim().length > 0
    || input.ceiling !== defaultBuyerFormValues.ceiling
    || input.vendors.some((vendor) => vendor.trim().length > 0)
    || input.deadlineMinutes !== defaultBuyerFormValues.deadlineMinutes
    || input.priceWeight !== defaultBuyerFormValues.priceWeight
    || input.deliveryWeight !== defaultBuyerFormValues.deliveryWeight
    || input.warrantyWeight !== defaultBuyerFormValues.warrantyWeight;
}

type BuyerFieldKey =
  | "title"
  | "ceiling"
  | "deadlineMinutes"
  | "objective"
  | "acceptanceCriteria"
  | "vendors"
  | "priceWeight"
  | "deliveryWeight"
  | "warrantyWeight";

type BuyerFieldErrors = Partial<Record<BuyerFieldKey, string>>;

function requiredFieldErrors(input: BuyerFormValues): BuyerFieldErrors {
  const errors: BuyerFieldErrors = {};
  if (!input.title.trim()) errors.title = "Enter a public title.";
  if (!input.ceiling.trim()) errors.ceiling = "Enter an escrow ceiling.";
  if (!input.deadlineMinutes.trim()) errors.deadlineMinutes = "Enter a bid deadline.";
  if (!input.objective.trim()) errors.objective = "Describe the public objective.";
  if (!input.acceptanceCriteria.trim()) errors.acceptanceCriteria = "Add acceptance criteria.";
  if (!input.vendors.some((vendor) => vendor.trim())) errors.vendors = "Add at least one approved vendor address.";
  if (!input.priceWeight.trim()) errors.priceWeight = "Enter the price weight.";
  if (!input.deliveryWeight.trim()) errors.deliveryWeight = "Enter the delivery weight.";
  if (!input.warrantyWeight.trim()) errors.warrantyWeight = "Enter the warranty weight.";
  return errors;
}

function buildFlareTenderTerms(input: BuyerFormValues, blockTimestamp: bigint): FlareTenderTerms {
  const minutes = Number(input.deadlineMinutes);
  if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 30 * 24 * 60) throw new Error("Deadline must be between 5 minutes and 30 days.");
  const price = parseWeight(input.priceWeight, "Price");
  const delivery = parseWeight(input.deliveryWeight, "Delivery");
  const warranty = parseWeight(input.warrantyWeight, "Warranty");
  if (price + delivery + warranty !== 10_000) throw new Error("Scoring weights must total 100%.");
  const approvedVendors = parseVendors(input.vendors);
  const amount = parseCeiling(input.ceiling);
  const metadata = input.title.trim();
  if (metadata.length < 3 || metadata.length > 160) throw new Error("Add a short public procurement title (3–160 characters).");
  const briefObjective = input.objective.trim();
  if (briefObjective.length < 20 || briefObjective.length > 1200) throw new Error("Describe the public outcome in 20–1200 characters.");
  const briefAcceptance = input.acceptanceCriteria.trim();
  if (briefAcceptance.length < 10 || briefAcceptance.length > 1200) throw new Error("Add acceptance criteria in 10–1200 characters.");
  const briefQuestions = input.vendorQuestions.trim();
  if (briefQuestions.length > 1200) throw new Error("Vendor questions must be at most 1200 characters.");
  const scoringPolicy = {
    schemaVersion: 1,
    ceilingXrpMicros: amount,
    bidDeadline: blockTimestamp + BigInt(minutes * 60),
    allowXrp: true,
    allowUsd: true,
    ftsoFeedId: coston2FlarePublicRelease.protocols.xrpUsdFeedId,
    maxDeliveryDays: 30,
    minWarrantyDays: 7,
    maxWarrantyDays: 90,
    priceWeightBps: price,
    deliveryWeightBps: delivery,
    warrantyWeightBps: warranty,
    requiredCredentials: [],
  } as const;
  return {
    metadataHash: hashFlareBuyerBrief({
      title: metadata,
      category: input.category,
      objective: briefObjective,
      acceptanceCriteria: briefAcceptance,
      vendorQuestions: briefQuestions,
      bidDeadline: scoringPolicy.bidDeadline,
      approvedVendors,
    }),
    scoringPolicy,
    approvedVendors,
    extensionId: BigInt(coston2FlarePublicRelease.fcc.extensionId),
    codeVersion: coston2FlarePublicRelease.fcc.codeHash,
    teeIds: coston2FlarePublicRelease.fcc.teeIds as [Address, Address, Address],
    teeKeyFingerprints: coston2FlarePublicRelease.fcc.teeKeyFingerprints as [Hex, Hex, Hex],
  };
}

function parseXrplOwner(value: string): string {
  const owner = value.trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(owner)) throw new Error("XRPL_OWNER_ADDRESS_INVALID");
  return owner;
}

function parseXrplTransactionId(value: string): Hex | null {
  const normalized = value.trim().replace(/^0x/i, "");
  if (normalized === "") return null;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error("XRPL_TRANSACTION_ID_INVALID");
  return `0x${normalized.toLowerCase()}` as Hex;
}

function parseWalletId(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error("SMART_ACCOUNT_WALLET_ID_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 255) throw new Error("SMART_ACCOUNT_WALLET_ID_INVALID");
  return parsed;
}

function parseExecutorFee(value: string): bigint {
  if (!/^\d+$/.test(value.trim())) throw new Error("EXECUTOR_FEE_UBA_INVALID");
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error("EXECUTOR_FEE_UBA_INVALID");
  return parsed;
}

function assertXrplPaymentDestination(value: string): string {
  const destination = value.trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination)) {
    throw new Error("XRPL_PAYMENT_DESTINATION_INVALID");
  }
  return destination;
}

export function FlareBuyerWorkspace({
  wallet,
  onRefresh,
  initialFundingMethod = "coston2",
}: {
  wallet: WalletController;
  onRefresh: () => void;
  initialFundingMethod?: FlareFundingMethod;
}) {
  const toasts = useToasts();
  const [initialDraft] = useState(() => readBuyerPublicDraft());
  const [title, setTitle] = useState(initialDraft?.title ?? defaultBuyerFormValues.title);
  const [category, setCategory] = useState<FlareBuyerBriefCategory>(initialDraft?.category ?? defaultBuyerFormValues.category);
  const [objective, setObjective] = useState(initialDraft?.objective ?? defaultBuyerFormValues.objective);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(initialDraft?.acceptanceCriteria ?? defaultBuyerFormValues.acceptanceCriteria);
  const [vendorQuestions, setVendorQuestions] = useState(initialDraft?.vendorQuestions ?? defaultBuyerFormValues.vendorQuestions);
  const [ceiling, setCeiling] = useState(initialDraft?.ceiling ?? defaultBuyerFormValues.ceiling);
  const [vendors, setVendors] = useState<string[]>(initialDraft ? [...initialDraft.vendors] : [...defaultBuyerFormValues.vendors]);
  const [deadlineMinutes, setDeadlineMinutes] = useState(initialDraft?.deadlineMinutes ?? defaultBuyerFormValues.deadlineMinutes);
  const [priceWeight, setPriceWeight] = useState(initialDraft?.priceWeight ?? defaultBuyerFormValues.priceWeight);
  const [deliveryWeight, setDeliveryWeight] = useState(initialDraft?.deliveryWeight ?? defaultBuyerFormValues.deliveryWeight);
  const [warrantyWeight, setWarrantyWeight] = useState(initialDraft?.warrantyWeight ?? defaultBuyerFormValues.warrantyWeight);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<BuyerFieldErrors>({});
  const [vendorErrors, setVendorErrors] = useState<string[]>([""]);
  const [vendorValidationAttempted, setVendorValidationAttempted] = useState(false);
  const [fundingMethod, setFundingMethod] = useState<FlareFundingMethod>(initialFundingMethod);
  const [last, setLast] = useState<{ hash: string; tenderId: string } | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;
  const weightValues = [priceWeight, deliveryWeight, warrantyWeight] as const;
  const weightTotal = weightTotalPercent(weightValues);
  const weightError = weightValidationMessage(weightValues);
  const vendorCount = vendors.filter((vendor) => vendor.trim()).length;
  const usingXrplFunding = fundingMethod === "xrpl";
  const currentFormValues: BuyerFormValues = {
    title,
    category,
    objective,
    acceptanceCriteria,
    vendorQuestions,
    ceiling,
    vendors,
    deadlineMinutes,
    priceWeight,
    deliveryWeight,
    warrantyWeight,
  };
  const hasSavedDraft = hasMeaningfulBuyerDraft(currentFormValues);

  useEffect(() => {
    setFundingMethod(initialFundingMethod);
  }, [initialFundingMethod]);

  useEffect(() => {
    if (hasMeaningfulBuyerDraft(currentFormValues)) saveBuyerPublicDraft(currentFormValues);
    else clearBuyerPublicDraft();
  }, [acceptanceCriteria, category, ceiling, deadlineMinutes, deliveryWeight, objective, priceWeight, title, vendorQuestions, vendors, warrantyWeight]);

  function clearPublicDraft() {
    setTitle(defaultBuyerFormValues.title);
    setCategory(defaultBuyerFormValues.category);
    setObjective(defaultBuyerFormValues.objective);
    setAcceptanceCriteria(defaultBuyerFormValues.acceptanceCriteria);
    setVendorQuestions(defaultBuyerFormValues.vendorQuestions);
    setCeiling(defaultBuyerFormValues.ceiling);
    setVendors([...defaultBuyerFormValues.vendors]);
    setDeadlineMinutes(defaultBuyerFormValues.deadlineMinutes);
    setPriceWeight(defaultBuyerFormValues.priceWeight);
    setDeliveryWeight(defaultBuyerFormValues.deliveryWeight);
    setWarrantyWeight(defaultBuyerFormValues.warrantyWeight);
    setError(null);
    setFieldErrors({});
    setVendorErrors([""]);
    setVendorValidationAttempted(false);
    clearBuyerPublicDraft();
  }

  function chooseFundingMethod(nextMethod: FlareFundingMethod) {
    if (busy || nextMethod === fundingMethod) return;
    setFundingMethod(nextMethod);
    setError(null);
    setLast(null);
    setFieldErrors({});
  }

  function visibleVendorErrors(values: readonly string[]) {
    const errors = vendorRowErrors(values);
    return errors.map((message, index) => values[index].trim() || vendorValidationAttempted ? message : "");
  }

  function updateVendors(nextVendors: string[]) {
    setVendors(nextVendors);
    setVendorErrors(visibleVendorErrors(nextVendors));
    clearFieldError("vendors");
  }

  function validateApprovedVendors() {
    setVendorValidationAttempted(true);
    const errors = vendorRowErrors(vendors);
    setVendorErrors(errors);
    if (errors.some(Boolean)) {
      setError("Fix the highlighted vendor addresses before approving the tender.");
      return false;
    }
    return true;
  }

  function addVendor() {
    if (vendors.length >= maxApprovedVendors) return;
    updateVendors([...vendors, ""]);
  }

  function removeVendor(index: number) {
    if (vendors.length <= 1) return;
    updateVendors(vendors.filter((_vendor, vendorIndex) => vendorIndex !== index));
  }

  function clearFieldError(field: BuyerFieldKey) {
    setFieldErrors((current) => current[field] ? { ...current, [field]: undefined } : current);
  }

  function validateRequiredFields() {
    const errors = requiredFieldErrors({
      title,
      category,
      objective,
      acceptanceCriteria,
      vendorQuestions,
      ceiling,
      vendors,
      deadlineMinutes,
      priceWeight,
      deliveryWeight,
      warrantyWeight,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Complete the highlighted required fields before approving the tender.");
      return false;
    }
    return true;
  }

  async function createTender() {
    if (!connected) return;
    const requiredFieldsValid = validateRequiredFields();
    const approvedVendorsValid = validateApprovedVendors();
    if (!requiredFieldsValid || !approvedVendorsValid) return;
    setError(null);
    setLast(null);
    setBusy(true);
    const toastId = toasts.startStack("CREATE TENDER", "Reading Coston2 time and building public rules…");
    try {
      const market = coston2FlarePublicRelease.market;
      const token = coston2FlarePublicRelease.protocols.fTestXRP;
      const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
      if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
      const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
      const block = await publicClient.getBlock({ blockTag: "latest" });
      const terms = buildFlareTenderTerms({
        title,
        category,
        objective,
        acceptanceCriteria,
        vendorQuestions,
        ceiling,
        vendors,
        deadlineMinutes,
        priceWeight,
        deliveryWeight,
        warrantyWeight,
      }, block.timestamp);
      const amount = terms.scoringPolicy.ceilingXrpMicros;
      if (terms.teeKeyFingerprints.length !== 3) throw new Error("COSTON2_FCC_KEYS_UNAVAILABLE");
      const approval = await publicClient.simulateContract({ account: wallet.state.account!, address: token, abi: erc20Abi, functionName: "approve", args: [market, amount] });
      toasts.update(toastId, "Approving the exact public FTestXRP ceiling…");
      const approvalHash = await wallet.state.walletClient!.writeContract(approval.request);
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      if (approvalReceipt.status !== "success") throw new Error("FLARE_APPROVAL_FAILED");
      toasts.update(toastId, "Creating the funded tender with frozen FCC identities…");
      const creation = await publicClient.simulateContract({ account: wallet.state.account!, address: market, abi: flareQuorumFlareMarketAbi as Abi, functionName: "createTender", args: [terms] });
      const creationHash = await wallet.state.walletClient!.writeContract(creation.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash });
      if (receipt.status !== "success") throw new Error("FLARE_TENDER_CREATION_FAILED");
      const createdLog = receipt.logs
        .filter((log) => log.address.toLowerCase() === market.toLowerCase())
        .map((log) => {
          try {
            return decodeEventLog({
              abi: flareQuorumFlareMarketAbi,
              data: log.data,
              topics: log.topics,
              strict: true,
            });
          } catch {
            return null;
          }
        })
        .find((event) => event?.eventName === "TenderCreated");
      if (!createdLog || !createdLog.args || typeof createdLog.args !== "object") {
        throw new Error("FLARE_TENDER_CREATED_EVENT_MISSING");
      }
      const args = createdLog.args as {
        tenderId?: unknown;
        buyer?: unknown;
        rulesHash?: unknown;
        ceiling?: unknown;
      };
      if (
        typeof args.tenderId !== "bigint" ||
        typeof args.buyer !== "string" ||
        typeof args.rulesHash !== "string" ||
        args.ceiling !== amount ||
        args.buyer.toLowerCase() !== wallet.state.account!.toLowerCase() ||
        args.rulesHash.toLowerCase() !== calculateFlareRulesHash(terms.scoringPolicy).toLowerCase()
      ) {
        throw new Error("FLARE_TENDER_CREATED_EVENT_MISMATCH");
      }
      const tenderId = args.tenderId;
      setLast({ hash: creationHash, tenderId: tenderId.toString() });
      toasts.succeed(toastId, `Tender #${tenderId.toString()} is open on Coston2.`);
      onRefresh();
    } catch (cause) {
      const message = flareTenderErrorMessage(cause);
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setBusy(false);
    }
  }

  async function prepareXrpFunding(input: XrpFundingPrepareInput): Promise<XrpFundingPreview> {
    const requiredFieldsValid = validateRequiredFields();
    const approvedVendorsValid = validateApprovedVendors();
    if (!requiredFieldsValid || !approvedVendorsValid) {
      throw new Error("Complete the highlighted tender fields before preparing XRP funding.");
    }
    const rpcUrl = import.meta.env.VITE_COSTON2_RPC_URL?.trim();
    if (!rpcUrl) throw new Error("COSTON2_RPC_URL_MISSING");
    const xrplOwner = parseXrplOwner(input.xrplOwner);
    const xrplTransactionId = parseXrplTransactionId(input.xrplTransactionId);
    const walletId = parseWalletId(input.walletId);
    const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const terms = buildFlareTenderTerms({
      title,
      category,
      objective,
      acceptanceCriteria,
      vendorQuestions,
      ceiling,
      vendors,
      deadlineMinutes,
      priceWeight,
      deliveryWeight,
      warrantyWeight,
    }, block.timestamp);
    const personalAccount = await publicClient.readContract({
      address: coston2FlarePublicRelease.protocols.masterAccountController,
      abi: smartAccountReaderAbi,
      functionName: "getPersonalAccount",
      args: [xrplOwner],
    });
    if (personalAccount.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      throw new Error("SMART_ACCOUNT_PERSONAL_ACCOUNT_UNAVAILABLE");
    }
    const nonce = await publicClient.readContract({
      address: coston2FlarePublicRelease.protocols.masterAccountController,
      abi: smartAccountReaderAbi,
      functionName: "getNonce",
      args: [personalAccount],
    });
    const assetManager = coston2FlarePublicRelease.protocols.assetManagerFXRP;
    const [paymentDestinationRaw, feeBips, minimumFeeUBA, officialExecutorFeeUBA] = await Promise.all([
      publicClient.readContract({
        address: assetManager,
        abi: assetManagerFAssetsAbi,
        functionName: "directMintingPaymentAddress",
      }),
      publicClient.readContract({
        address: assetManager,
        abi: assetManagerFAssetsAbi,
        functionName: "getDirectMintingFeeBIPS",
      }),
      publicClient.readContract({
        address: assetManager,
        abi: assetManagerFAssetsAbi,
        functionName: "getDirectMintingMinimumFeeUBA",
      }),
      publicClient.readContract({
        address: assetManager,
        abi: assetManagerFAssetsAbi,
        functionName: "getDirectMintingExecutorFeeUBA",
      }),
    ]);
    if (typeof paymentDestinationRaw !== "string") throw new Error("XRPL_PAYMENT_DESTINATION_UNAVAILABLE");
    const paymentDestination = assertXrplPaymentDestination(paymentDestinationRaw);
    const officialExecutorFee = BigInt(officialExecutorFeeUBA);
    const executorFeeUBA = input.executorFeeUBA.trim() === ""
      ? officialExecutorFee
      : parseExecutorFee(input.executorFeeUBA);
    if (executorFeeUBA !== officialExecutorFee) throw new Error("EXECUTOR_FEE_MISMATCH");
    const plan = buildMintAndFundPlan({
      personalAccount,
      nonce,
      fTestXrp: coston2FlarePublicRelease.protocols.fTestXRP,
      market: coston2FlarePublicRelease.market,
      terms,
      walletId,
      executorFee: executorFeeUBA,
    });
    const quote = quoteSmartAccountDirectMinting(
      terms.scoringPolicy.ceilingXrpMicros + executorFeeUBA,
      BigInt(feeBips),
      BigInt(minimumFeeUBA),
    );
    const paymentDraft = {
      TransactionType: "Payment",
      Account: xrplOwner,
      Destination: paymentDestination,
      Amount: quote.paymentAmountUBA.toString(),
      Memos: [{ Memo: { MemoData: plan.memoData.slice(2).toUpperCase(), MemoType: "FLAREQUORUM_0XFE" } }],
    };
    const job = xrplTransactionId === null ? null : {
      version: 1,
      xrplTransactionId,
      personalAccount,
      nonce,
      walletId,
      executorFeeUBA,
      terms,
    };
    return {
      personalAccount,
      nonce: nonce.toString(),
      walletId,
      executorFeeUBA: executorFeeUBA.toString(),
      xrplTransactionId,
      memoData: plan.memoData,
      paymentDestination,
      paymentAmountUBA: quote.paymentAmountUBA.toString(),
      mintingFeeUBA: quote.mintingFeeUBA.toString(),
      paymentDraftJson: JSON.stringify(paymentDraft, null, 2),
      jobJson: job === null ? null : JSON.stringify(job, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2),
    };
  }

  return (
    <main id="main-content" className="role-workspace flare-buyer-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">BUYER / CHOOSE A FUNDING PATH</p>
        <h1>Fund transparent rules.</h1>
        <p>Define one public tender, then choose whether its escrow comes from a Coston2 wallet or an XRP-native XRPL payment.</p>
      </section>
      <section className="funding-method-picker" aria-labelledby="funding-method-title">
        <header>
          <div>
            <p className="eyebrow">FUNDING METHOD</p>
            <h2 id="funding-method-title">How will you fund this tender?</h2>
          </div>
          <span className="privacy-badge verified">CHOOSE ONE</span>
        </header>
        <div className="funding-method-options">
          <button
            className={`funding-method-option${fundingMethod === "coston2" ? " selected" : ""}`}
            type="button"
            aria-pressed={fundingMethod === "coston2"}
            onClick={() => chooseFundingMethod("coston2")}
            disabled={busy}
          >
            <span className="funding-method-kicker">COSTON2 / FTESTXRP</span>
            <strong>Fund from a Coston2 wallet</strong>
            <small>Approve FTestXRP and open the tender directly.</small>
            <span className="funding-method-action" aria-hidden="true">{fundingMethod === "coston2" ? "SELECTED ✓" : "CHOOSE →"}</span>
          </button>
          <button
            className={`funding-method-option${fundingMethod === "xrpl" ? " selected" : ""}`}
            type="button"
            aria-pressed={fundingMethod === "xrpl"}
            onClick={() => chooseFundingMethod("xrpl")}
            disabled={busy}
          >
            <span className="funding-method-kicker">XRPL / XRP · ADVANCED</span>
            <strong>Fund from an XRP wallet</strong>
            <small>Prepare an XRPL Payment, then hand off FDC and Smart Account funding.</small>
            <span className="funding-method-action" aria-hidden="true">{fundingMethod === "xrpl" ? "SELECTED ✓" : "CHOOSE →"}</span>
          </button>
        </div>
      </section>
      <section id="buyer-brief" className="evidence-panel flare-buyer-form" aria-label="Buyer tender composer">
        <header className="detail-header"><div><p className="eyebrow">PUBLIC PROCUREMENT RULES</p><h2>{usingXrplFunding ? "Prepare an XRP-funded tender" : "Open a Coston2 tender"}</h2></div><span className="privacy-badge verified">{usingXrplFunding ? "XRPL → FTESTXRP" : "FTESTXRP / TESTNET"}</span></header>
        <div className="buyer-draft-bar" aria-live="polite">
          <div><strong>{hasSavedDraft ? "PUBLIC DRAFT SAVED IN THIS TAB" : "PUBLIC DRAFT AUTO-SAVE READY"}</strong><span>Only the public Buyer Brief fields below use session storage. Bid data is never stored here.</span></div>
          <button className="secondary-button" type="button" onClick={clearPublicDraft} disabled={busy || !hasSavedDraft}>CLEAR PUBLIC DRAFT</button>
        </div>
        <label>Public title<input aria-label="Public title" required minLength={3} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={`buyer-title-hint${fieldErrors.title ? " buyer-title-error" : ""}`} value={title} onChange={(event) => { setTitle(event.target.value); clearFieldError("title"); }} maxLength={160} placeholder="e.g. XRP treasury reporting" disabled={busy} autoComplete="off" /><small id="buyer-title-hint" className="field-guidance"><span>Public and immutable by hash · 3–160 characters</span><span>{title.length}/160</span></small>{fieldErrors.title && <small id="buyer-title-error" className="field-error" role="alert">{fieldErrors.title}</small>}</label>
        <div className="form-grid-two">
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as FlareBuyerBriefCategory)} disabled={busy}><option value="software">Software</option><option value="design">Design</option><option value="marketing">Marketing</option><option value="operations">Operations</option><option value="research">Research</option></select></label>
          <label>Escrow ceiling (FTestXRP)<input aria-label="Escrow ceiling (FTestXRP)" required aria-invalid={Boolean(fieldErrors.ceiling)} aria-describedby={`buyer-ceiling-hint${fieldErrors.ceiling ? " buyer-ceiling-error" : ""}`} inputMode="decimal" value={ceiling} onChange={(event) => { setCeiling(event.target.value); clearFieldError("ceiling"); }} disabled={busy} /><small id="buyer-ceiling-hint" className="field-guidance"><span>Positive amount · maximum 6 decimal places</span></small>{fieldErrors.ceiling && <small id="buyer-ceiling-error" className="field-error" role="alert">{fieldErrors.ceiling}</small>}</label>
          <label>Bid deadline (minutes)<input aria-label="Bid deadline (minutes)" required aria-invalid={Boolean(fieldErrors.deadlineMinutes)} aria-describedby={`buyer-deadline-hint${fieldErrors.deadlineMinutes ? " buyer-deadline-error" : ""}`} type="number" min={5} max={43200} value={deadlineMinutes} onChange={(event) => { setDeadlineMinutes(event.target.value); clearFieldError("deadlineMinutes"); }} disabled={busy} /><small id="buyer-deadline-hint" className="field-guidance"><span>5 minutes–30 days (43,200 minutes)</span></small>{fieldErrors.deadlineMinutes && <small id="buyer-deadline-error" className="field-error" role="alert">{fieldErrors.deadlineMinutes}</small>}</label>
          <label>Public objective<textarea aria-label="Public objective" required minLength={20} aria-invalid={Boolean(fieldErrors.objective)} aria-describedby={`buyer-objective-hint${fieldErrors.objective ? " buyer-objective-error" : ""}`} value={objective} onChange={(event) => { setObjective(event.target.value); clearFieldError("objective"); }} rows={4} maxLength={1200} placeholder="What outcome should the selected vendor deliver?" disabled={busy} /><small id="buyer-objective-hint" className="field-guidance"><span>Public outcome · 20–1,200 characters</span><span>{objective.length}/1200</span></small>{fieldErrors.objective && <small id="buyer-objective-error" className="field-error" role="alert">{fieldErrors.objective}</small>}</label>
          <label>Acceptance criteria<textarea aria-label="Acceptance criteria" required minLength={10} aria-invalid={Boolean(fieldErrors.acceptanceCriteria)} aria-describedby={`buyer-acceptance-hint${fieldErrors.acceptanceCriteria ? " buyer-acceptance-error" : ""}`} value={acceptanceCriteria} onChange={(event) => { setAcceptanceCriteria(event.target.value); clearFieldError("acceptanceCriteria"); }} rows={4} maxLength={1200} placeholder="How will delivery be checked?" disabled={busy} /><small id="buyer-acceptance-hint" className="field-guidance"><span>Public checks · 10–1,200 characters</span><span>{acceptanceCriteria.length}/1200</span></small>{fieldErrors.acceptanceCriteria && <small id="buyer-acceptance-error" className="field-error" role="alert">{fieldErrors.acceptanceCriteria}</small>}</label>
          <label>Optional vendor questions<textarea aria-label="Optional vendor questions" aria-describedby="buyer-questions-hint" value={vendorQuestions} onChange={(event) => setVendorQuestions(event.target.value)} rows={3} maxLength={1200} placeholder="What should every vendor answer?" disabled={busy} /><small id="buyer-questions-hint" className="field-guidance"><span>Public and optional · maximum 1,200 characters</span><span>{vendorQuestions.length}/1200</span></small></label>
          <fieldset className="vendor-fieldset" aria-invalid={Boolean(fieldErrors.vendors || vendorErrors.some(Boolean))} aria-describedby={fieldErrors.vendors ? "buyer-vendors-error" : undefined}>
            <legend>Approved vendor addresses <span className="vendor-count">{vendorCount}/{maxApprovedVendors}</span></legend>
            <div className="vendor-input-list">
              {vendors.map((vendor, index) => (
                <div className="vendor-input-row" key={index}>
                  <div className="vendor-input-control">
                    <input
                      aria-label={`Approved vendor ${index + 1}`}
                      required
                      aria-invalid={Boolean(vendorErrors[index])}
                      aria-describedby={vendorErrors[index] ? `buyer-vendor-${index}-error` : undefined}
                      value={vendor}
                      onChange={(event) => updateVendors(vendors.map((current, vendorIndex) => vendorIndex === index ? event.target.value : current))}
                      placeholder="0x…"
                      disabled={busy}
                      autoComplete="off"
                    />
                    {vendorErrors[index] && <small id={`buyer-vendor-${index}-error`} className="field-error" role="alert">{vendorErrors[index]}</small>}
                  </div>
                  <button className="vendor-remove-button" type="button" aria-label={`Remove approved vendor ${index + 1}`} onClick={() => removeVendor(index)} disabled={busy || vendors.length <= 1}>×</button>
                </div>
              ))}
            </div>
            <button className="vendor-add-button" type="button" onClick={addVendor} disabled={busy || vendors.length >= maxApprovedVendors}>+ Add vendor</button>
            {fieldErrors.vendors && <small id="buyer-vendors-error" className="field-error" role="alert">{fieldErrors.vendors}</small>}
          </fieldset>
          <div className="form-hint"><strong>Brief and rules are public; bids are sealed.</strong><br />The market records the canonical brief hash, ceiling, vendor allowlist, FCC binding, and lifecycle checkpoints.</div>
        </div>
        <div className="form-grid-three">
          <label>Price weight<span className="percentage-input"><input required aria-invalid={Boolean(fieldErrors.priceWeight)} aria-describedby={fieldErrors.priceWeight ? "buyer-price-weight-error" : undefined} inputMode="numeric" maxLength={3} value={priceWeight} onChange={(event) => { setPriceWeight(event.target.value); clearFieldError("priceWeight"); }} disabled={busy} /><span aria-hidden="true">%</span></span>{fieldErrors.priceWeight && <small id="buyer-price-weight-error" className="field-error" role="alert">{fieldErrors.priceWeight}</small>}</label>
          <label>Delivery weight<span className="percentage-input"><input required aria-invalid={Boolean(fieldErrors.deliveryWeight)} aria-describedby={fieldErrors.deliveryWeight ? "buyer-delivery-weight-error" : undefined} inputMode="numeric" maxLength={3} value={deliveryWeight} onChange={(event) => { setDeliveryWeight(event.target.value); clearFieldError("deliveryWeight"); }} disabled={busy} /><span aria-hidden="true">%</span></span>{fieldErrors.deliveryWeight && <small id="buyer-delivery-weight-error" className="field-error" role="alert">{fieldErrors.deliveryWeight}</small>}</label>
          <label>Warranty weight<span className="percentage-input"><input required aria-invalid={Boolean(fieldErrors.warrantyWeight)} aria-describedby={fieldErrors.warrantyWeight ? "buyer-warranty-weight-error" : undefined} inputMode="numeric" maxLength={3} value={warrantyWeight} onChange={(event) => { setWarrantyWeight(event.target.value); clearFieldError("warrantyWeight"); }} disabled={busy} /><span aria-hidden="true">%</span></span>{fieldErrors.warrantyWeight && <small id="buyer-warranty-weight-error" className="field-error" role="alert">{fieldErrors.warrantyWeight}</small>}</label>
        </div>
        <p className={`form-hint scoring-weight-note${weightError ? " invalid" : " valid"}`} role={weightError ? "alert" : undefined}>
          {weightError ?? `Total weight: ${weightTotal}% ✓`}
        </p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {!usingXrplFunding && <WalletPanel wallet={wallet} network="coston2" compact />}
        {!usingXrplFunding && <button className="primary-button" type="button" onClick={() => void createTender()} disabled={busy || !connected || Boolean(weightError)}>{busy ? "WAITING FOR C2FLR…" : "APPROVE & OPEN TENDER →"}</button>}
        {last && <p className="form-hint" aria-live="polite">Tender #{last.tenderId} created · <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">inspect transaction ↗</a></p>}
      </section>
      {usingXrplFunding && <FlareXrpFundingPanel onPrepare={prepareXrpFunding} />}
    </main>
  );
}
