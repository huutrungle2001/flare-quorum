import {
  buildMintAndFundPlan,
  calculateFlareRulesHash,
  coston2FlarePublicRelease,
  assetManagerFAssetsAbi,
  quoteSmartAccountDirectMinting,
  smartAccountReaderAbi,
  veilBidFlareMarketAbi,
  type FlareTenderTerms,
} from "@veilbid/flare-bindings";
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
import { useState } from "react";
import { FlareXrpFundingPanel, type XrpFundingPrepareInput, type XrpFundingPreview } from "./FlareXrpFundingPanel";

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

function parseVendors(value: string): Address[] {
  const entries = value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  if (entries.length === 0 || entries.length > 8) throw new Error("Enter 1–8 approved vendor addresses.");
  const vendors = entries.map((entry) => {
    if (!isAddress(entry)) throw new Error("Every vendor must be a valid EVM address.");
    return getAddress(entry);
  });
  if (new Set(vendors.map((entry) => entry.toLowerCase())).size !== vendors.length) throw new Error("Vendor addresses must be unique.");
  return vendors;
}

function parseCeiling(value: string): bigint {
  const normalized = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(normalized)) throw new Error("Enter a positive FTestXRP ceiling with at most 6 decimals.");
  const amount = parseUnits(normalized, 6);
  if (amount <= 0n) throw new Error("Ceiling must be above zero.");
  return amount;
}

function parseWeight(value: string, label: string): number {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${label} weight is invalid.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 10_000) throw new Error(`${label} weight is invalid.`);
  return parsed;
}

export type FlareBuyerBriefCategory = "software" | "design" | "marketing" | "operations" | "research";

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
  vendors: string;
  deadlineMinutes: string;
  priceWeight: string;
  deliveryWeight: string;
  warrantyWeight: string;
}

function buildFlareTenderTerms(input: BuyerFormValues, blockTimestamp: bigint): FlareTenderTerms {
  const minutes = Number(input.deadlineMinutes);
  if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 30 * 24 * 60) throw new Error("Deadline must be between 5 minutes and 30 days.");
  const price = parseWeight(input.priceWeight, "Price");
  const delivery = parseWeight(input.deliveryWeight, "Delivery");
  const warranty = parseWeight(input.warrantyWeight, "Warranty");
  if (price + delivery + warranty !== 10_000) throw new Error("Scoring weights must total 10000 bps.");
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
  journey = "combined",
}: {
  wallet: WalletController;
  onRefresh: () => void;
  journey?: "combined" | "evm" | "xrp";
}) {
  const toasts = useToasts();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<FlareBuyerBriefCategory>("software");
  const [objective, setObjective] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [vendorQuestions, setVendorQuestions] = useState("");
  const [ceiling, setCeiling] = useState("1");
  const [vendors, setVendors] = useState("");
  const [deadlineMinutes, setDeadlineMinutes] = useState("30");
  const [priceWeight, setPriceWeight] = useState("6000");
  const [deliveryWeight, setDeliveryWeight] = useState("2500");
  const [warrantyWeight, setWarrantyWeight] = useState("1500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; tenderId: string } | null>(null);
  const connected = wallet.state.status === "connected" && wallet.state.account && wallet.state.walletClient;

  async function createTender() {
    if (!connected) return;
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
      const creation = await publicClient.simulateContract({ account: wallet.state.account!, address: market, abi: veilBidFlareMarketAbi as Abi, functionName: "createTender", args: [terms] });
      const creationHash = await wallet.state.walletClient!.writeContract(creation.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash });
      if (receipt.status !== "success") throw new Error("FLARE_TENDER_CREATION_FAILED");
      const createdLog = receipt.logs
        .filter((log) => log.address.toLowerCase() === market.toLowerCase())
        .map((log) => {
          try {
            return decodeEventLog({
              abi: veilBidFlareMarketAbi,
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
      setError(cause instanceof Error ? cause.message : "FLARE_TENDER_CREATION_FAILED");
      toasts.fail(toastId, "Tender creation stopped; no partial success is shown.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareXrpFunding(input: XrpFundingPrepareInput): Promise<XrpFundingPreview> {
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
      Memos: [{ Memo: { MemoData: plan.memoData.slice(2).toUpperCase(), MemoType: "VEILBID_0XFE" } }],
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
        <p className="eyebrow">{journey === "xrp" ? "XRP TREASURY / XRPL → FDC → SMART ACCOUNT" : "COSTON2 BUYER / EVM RECOVERY PATH"}</p>
        <h1>{journey === "xrp" ? "Fund from XRP." : "Fund transparent rules."}</h1>
        <p>{journey === "xrp"
          ? "Build a wallet-ready XRPL Payment whose 0xFE memo commits to the exact Smart Account operation. VeilBid receives only public identifiers and never an XRPL secret."
          : "Approve the exact public FTestXRP ceiling, then create a tender frozen to the verified FCC extension and three production-status identities. Bid values remain outside the contract."}</p>
      </section>
      {journey !== "xrp" && <WalletPanel wallet={wallet} network="coston2" />}
      <section id="buyer-brief" className="evidence-panel flare-buyer-form" aria-label="Coston2 buyer tender composer">
        <header className="detail-header"><div><p className="eyebrow">PUBLIC PROCUREMENT RULES</p><h2>{journey === "xrp" ? "Prepare the XRP-funded tender" : "Open a Coston2 tender"}</h2></div><span className="privacy-badge verified">FTestXRP / TESTNET</span></header>
        <label>Public title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="e.g. XRP treasury reporting" disabled={busy} autoComplete="off" /><small>The public brief is hashed into immutable metadata; bids remain outside the contract.</small></label>
        <div className="form-grid-two">
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as FlareBuyerBriefCategory)} disabled={busy}><option value="software">Software</option><option value="design">Design</option><option value="marketing">Marketing</option><option value="operations">Operations</option><option value="research">Research</option></select></label>
          <label>Escrow ceiling (FTestXRP)<input inputMode="decimal" value={ceiling} onChange={(event) => setCeiling(event.target.value)} disabled={busy} /></label>
          <label>Bid deadline (minutes)<input type="number" min={5} max={43200} value={deadlineMinutes} onChange={(event) => setDeadlineMinutes(event.target.value)} disabled={busy} /></label>
          <label>Public objective<textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} maxLength={1200} placeholder="What outcome should the selected vendor deliver?" disabled={busy} /></label>
          <label>Acceptance criteria<textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} rows={4} maxLength={1200} placeholder="How will delivery be checked?" disabled={busy} /></label>
          <label>Optional vendor questions<textarea value={vendorQuestions} onChange={(event) => setVendorQuestions(event.target.value)} rows={3} maxLength={1200} placeholder="What should every vendor answer?" disabled={busy} /></label>
          <label>Approved vendor addresses<textarea value={vendors} onChange={(event) => setVendors(event.target.value)} rows={3} placeholder="0x… (one or more, comma/newline separated)" disabled={busy} /></label>
          <div className="form-hint"><strong>Brief and rules are public; bids are sealed.</strong><br />The market records the canonical brief hash, ceiling, vendor allowlist, FCC binding, and lifecycle checkpoints.</div>
        </div>
        <div className="form-grid-three">
          <label>Price weight (bps)<input inputMode="numeric" value={priceWeight} onChange={(event) => setPriceWeight(event.target.value)} disabled={busy} /></label>
          <label>Delivery weight (bps)<input inputMode="numeric" value={deliveryWeight} onChange={(event) => setDeliveryWeight(event.target.value)} disabled={busy} /></label>
          <label>Warranty weight (bps)<input inputMode="numeric" value={warrantyWeight} onChange={(event) => setWarrantyWeight(event.target.value)} disabled={busy} /></label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {journey !== "xrp" && <button className="primary-button" type="button" onClick={() => void createTender()} disabled={busy || !connected}>{busy ? "WAITING FOR C2FLR…" : "APPROVE &amp; OPEN TENDER →"}</button>}
        {last && <p className="form-hint" aria-live="polite">Tender #{last.tenderId} created · <a className="text-link" href={`https://coston2-explorer.flare.network/tx/${last.hash}`} target="_blank" rel="noreferrer">inspect transaction ↗</a></p>}
      </section>
      {journey !== "evm" && <FlareXrpFundingPanel onPrepare={prepareXrpFunding} />}
    </main>
  );
}
