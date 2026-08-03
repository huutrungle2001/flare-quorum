import type { PublicMarketIndex, PublicTender } from "@veilbid/chain-bindings";
import { getTenderReadiness } from "@veilbid/chain-bindings";
import deployment from "@veilbid/chain-bindings/addresses/sepolia.release";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useLocation, useSearchParams } from "react-router";
import type { LoadedPublicMarket } from "../public-market/loadPublicMarket";
import {
  type PublicMarketState,
  usePublicMarket,
} from "../public-market/usePublicMarket";
import { useWallet } from "../wallet/useWallet";
import type { WalletController } from "../wallet/WalletPanel";
import { WalletBalancePanel } from "../wallet/WalletBalancePanel";
import { ActivityWorkspace } from "../activity/ActivityWorkspace";
import { WinnerNotificationBanner } from "../activity/WinnerNotifications";
import { DocsPage } from "../landing/DocsPage";
import { LandingPage } from "../landing/LandingPage";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { ContextHelp } from "./ContextHelp";
import { scrollToPageTop } from "./navigationScroll";
import {
  formatLocalDeadline,
  formatUtcDeadline,
  remainingTimeLabel,
} from "../time/tenderTime";
import type { PrivateBidsSection } from "../workspaces/RoleWorkspace";
import {
  BuyerWorkspace,
  PrivateBidsWorkspace,
  type BuyerSection,
} from "../workspaces/CombinedWorkspaces";
import { FlareRoom } from "../flare/FlareRoom";

type RoomRole =
  | "PUBLIC"
  | "BUYER"
  | "PRIVATE BIDS"
  | "ACTIVITY"
  | "VENDOR"
  | "SAFE TREASURY";

type PublicTenderFilter =
  | "current"
  | "all"
  | "open"
  | "ready-to-close"
  | "awarded"
  | "refunded"
  | "cancelled";

const publicTenderFilters: ReadonlyArray<{
  value: PublicTenderFilter;
  label: string;
}> = [
  { value: "current", label: "Current & awarded" },
  { value: "all", label: "All tenders" },
  { value: "open", label: "Open" },
  { value: "ready-to-close", label: "Ready to close" },
  { value: "awarded", label: "Awarded" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

function isPublicTenderFilter(value: string | null): value is PublicTenderFilter {
  return publicTenderFilters.some((option) => option.value === value);
}

function filterPublicTenders(
  tenders: readonly PublicTender[],
  filter: PublicTenderFilter,
  nowSeconds: bigint,
) {
  if (filter === "all") return tenders;
  if (filter === "current") {
    return tenders.filter((tender) =>
      ["FundingPending", "Open", "Closed", "Awarded"].includes(tender.status),
    );
  }
  if (filter === "open") {
    return tenders.filter(
      (tender) =>
        tender.status === "Open" &&
        !getTenderReadiness(tender, nowSeconds).canClose,
    );
  }
  if (filter === "ready-to-close") {
    return tenders.filter(
      (tender) => getTenderReadiness(tender, nowSeconds).canClose,
    );
  }
  const status = filter === "cancelled" ? "Cancelled" :
    filter[0].toUpperCase() + filter.slice(1);
  return tenders.filter((tender) => tender.status === status);
}

const zeroIndex: PublicMarketIndex = {
  tenders: [],
  bids: [],
  checkpoint: null,
};

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function StatusBadge({
  status,
  readyToClose = false,
}: {
  status: PublicTender["status"];
  readyToClose?: boolean;
}) {
  const verified = ["Awarded", "Refunded"].includes(status);
  const encrypted = ["Open", "Closed"].includes(status);
  return (
    <span
      className={`privacy-badge ${
        readyToClose
          ? "ready"
          : verified
            ? "verified"
            : encrypted
              ? "encrypted"
              : ""
      }`}
    >
      <span aria-hidden="true">
        {readyToClose ? "↻" : verified ? "✓" : encrypted ? "◆" : "◌"}
      </span>
      {readyToClose ? "READY TO CLOSE" : status.toUpperCase()}
    </span>
  );
}

function TenderDeadline({
  timestamp,
  detail = false,
}: {
  timestamp: bigint;
  detail?: boolean;
}) {
  const [nowMilliseconds, setNowMilliseconds] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMilliseconds(Date.now()),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      {formatLocalDeadline(timestamp)}
      {detail ? (
        <small>On-chain: {formatUtcDeadline(timestamp)} UTC</small>
      ) : (
        <small>{remainingTimeLabel(timestamp, nowMilliseconds)}</small>
      )}
    </>
  );
}

function TenderCard({
  tender,
  selected,
  onSelect,
  nowSeconds,
}: {
  tender: PublicTender;
  selected: boolean;
  onSelect: () => void;
  nowSeconds: bigint;
}) {
  const readyToClose = getTenderReadiness(tender, nowSeconds).canClose;
  return (
    <div className="tender-card-shell">
      <button
        className={`tender-card ${selected ? "selected" : ""}`}
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <span className="card-kicker">TENDER / {tender.tenderId.toString()}</span>
        <span className="card-title">
          Confidential procurement #{tender.tenderId.toString()}
        </span>
        <span className="card-facts">
          <span>
            <strong>{formatUnits(tender.publicCeiling, 6)} vUSDC</strong>
            Public ceiling
          </span>
          <span>
            <strong>{tender.bidCount}/{tender.approvedVendorCount}</strong>
            Bids received
          </span>
        </span>
        <span className="card-deadline">
          Deadline · <TenderDeadline timestamp={tender.bidDeadline} />
        </span>
        <span className="card-footer">
          <StatusBadge status={tender.status} readyToClose={readyToClose} />
          <span className="card-arrow" aria-hidden="true">
            →
          </span>
        </span>
      </button>
      <ContextHelp
        compact
        label={`Help for public tender ${tender.tenderId.toString()}`}
        title={`HOW TO READ TENDER ${tender.tenderId.toString()}`}
        steps={[
          "Select this dossier to open its public terms and lifecycle.",
          "The ceiling, vendor count, deadline, and status are public coordination data.",
          "Bid prices remain encrypted; only a proof-derived winner becomes public after close.",
        ]}
        note="The countdown uses your local timezone; the detail panel also shows canonical UTC."
      />
    </div>
  );
}

function Lifecycle({ tender }: { tender: PublicTender }) {
  const sequence = ["FundingPending", "Open", "Closed"] as const;
  const final =
    tender.status === "Awarded" || tender.status === "Refunded"
      ? tender.status
      : "Awarded / Refunded";
  const steps = [...sequence, final];
  const activeIndex = sequence.includes(
    tender.status as (typeof sequence)[number],
  )
    ? sequence.indexOf(tender.status as (typeof sequence)[number])
    : 3;
  return (
    <ol className="lifecycle" aria-label="Tender lifecycle">
      {steps.map((step, index) => (
        <li
          key={step}
          className={
            index < activeIndex
              ? "complete"
              : index === activeIndex
                ? "active"
                : ""
          }
        >
          <span>{index < activeIndex ? "✓" : index + 1}</span>
          {step.replace(/([A-Z])/g, " $1").trim().toUpperCase()}
        </li>
      ))}
    </ol>
  );
}

function AwardReceiptPanel({ tender }: { tender: PublicTender }) {
  if (tender.status !== "Awarded" || !tender.winner) return null;
  const receiptAddress = deployment.contracts.VeilBidAwardReceipt.address;
  return (
    <section className="receipt-panel" aria-label="Award receipt evidence">
      <div>
        <p className="eyebrow">NON-TRANSFERABLE AWARD RECEIPT</p>
        <h3>Receipt #{tender.tenderId.toString()}</h3>
        <p>
          Minted atomically to the proof-derived winner. Approval, transfer,
          and receiver-callback paths are disabled by the receipt contract.
        </p>
      </div>
      <dl>
        <div><dt>Owner</dt><dd title={tender.winner}>{shortAddress(tender.winner)}</dd></div>
        <div><dt>Contract</dt><dd title={receiptAddress}>{shortAddress(receiptAddress)}</dd></div>
        <div><dt>Finalization tx</dt><dd title={tender.updatedTransaction}>{shortAddress(tender.updatedTransaction)}</dd></div>
        <div><dt>Transferability</dt><dd>DISABLED</dd></div>
      </dl>
      <a
        className="text-link"
        href={`https://sepolia.etherscan.io/token/${receiptAddress}?a=${tender.tenderId.toString()}`}
        target="_blank"
        rel="noreferrer"
      >
        INSPECT ON SEPOLIA ↗
      </a>
    </section>
  );
}

function TenderDetail({
  tender,
  indexedBlock,
  finalizedBlock,
  nowSeconds,
}: {
  tender: PublicTender;
  indexedBlock: bigint;
  finalizedBlock: bigint;
  nowSeconds: bigint;
}) {
  const finalityPending = tender.updatedBlock > finalizedBlock;
  const readiness = getTenderReadiness(
    tender,
    nowSeconds,
  );
  const readinessLabel = readiness.needsFundingProof
    ? "VERIFYING ESCROW"
    : readiness.canClose
      ? "CLOSE READY"
      : readiness.needsWinnerProof
        ? "PUBLIC PROOF PENDING"
        : readiness.terminal
          ? "TERMINAL / VERIFIED ON-CHAIN"
          : "ACCEPTING SEALED BIDS";

  return (
    <article className="detail-panel">
      <header className="detail-header">
        <div>
          <p className="eyebrow">PUBLIC DOSSIER / TENDER {tender.tenderId.toString()}</p>
          <h2>Procurement terms stay public. Prices stay sealed.</h2>
        </div>
        <ContextHelp
          compact
          label={`Help for tender ${tender.tenderId.toString()} detail`}
          title="HOW TO READ THIS DOSSIER"
          steps={[
            "Read the lifecycle and readiness strip to see whether funding, bidding, closing, or proof is pending.",
            "Public metadata and the winner address do not reveal bid prices.",
            "After Awarded, inspect the non-transferable receipt and finalization transaction here.",
          ]}
        />
        <StatusBadge
          status={tender.status}
          readyToClose={readiness.canClose}
        />
      </header>

      <Lifecycle tender={tender} />

      <section className="readiness-strip">
        <span className="signal-dot" aria-hidden="true" />
        <div>
          <strong>{readinessLabel}</strong>
          <span>
            Derived from confirmed public state, not a contract status.
          </span>
        </div>
      </section>

      <dl className="term-grid">
        <div>
          <dt>Public ceiling</dt>
          <dd>{formatUnits(tender.publicCeiling, 6)} vUSDC</dd>
        </div>
        <div>
          <dt>Bid deadline</dt>
          <dd>
            <TenderDeadline timestamp={tender.bidDeadline} detail />
          </dd>
        </div>
        <div>
          <dt>Buyer / Safe</dt>
          <dd title={tender.buyer}>{shortAddress(tender.buyer)}</dd>
        </div>
        <div>
          <dt>Review wallet</dt>
          <dd title={tender.reviewViewer}>{shortAddress(tender.reviewViewer)}</dd>
        </div>
        <div>
          <dt>Sealed bids</dt>
          <dd>{tender.bidCount} / {tender.approvedVendorCount} vendors</dd>
        </div>
      </dl>

      <section className="privacy-panel">
        <div className="aperture" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="eyebrow">PUBLIC WINNER / PRIVATE PRICE</p>
          <h3>
            {tender.winner
              ? `Awarded to ${shortAddress(tender.winner)}`
              : "Winner is proof-derived after close"}
          </h3>
          <p>
            Bid values never enter this public index. Only the winner ID is
            deliberately opened for on-chain proof verification.
          </p>
          <div className="badge-row">
            <span className="privacy-badge encrypted">◆ ENCRYPTED PRICE</span>
            <span className="privacy-badge">◎ PUBLIC METADATA</span>
          </div>
        </div>
      </section>

      <AwardReceiptPanel tender={tender} />

      <section className="evidence-panel">
        <p className="eyebrow">
          {finalityPending ? "CONFIRMED / FINALITY PENDING" : "FINALIZED EVIDENCE"}
        </p>
        <dl>
          <div>
            <dt>Chain</dt>
            <dd>Ethereum Sepolia / 11155111</dd>
          </div>
          <div>
            <dt>Indexed through</dt>
            <dd>Block {indexedBlock.toString()}</dd>
          </div>
          <div>
            <dt>Finalized through</dt>
            <dd>Block {finalizedBlock.toString()}</dd>
          </div>
          <div>
            <dt>Metadata fingerprint</dt>
            <dd title={tender.metadataHash}>
              {shortAddress(tender.metadataHash)}
            </dd>
          </div>
          <div>
            <dt>Last transaction</dt>
            <dd title={tender.updatedTransaction}>
              {shortAddress(tender.updatedTransaction)}
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

export function ExplorerView({
  state,
  onRetry,
  activeRole = "PUBLIC",
  onRoleChange,
  buyerSection,
  onBuyerSectionChange,
  privateSection,
  onPrivateSectionChange,
  wallet,
}: {
  state: PublicMarketState;
  onRetry: () => void;
  activeRole?: RoomRole;
  onRoleChange?: (role: RoomRole) => void;
  buyerSection?: BuyerSection;
  onBuyerSectionChange?: (section: BuyerSection) => void;
  privateSection?: PrivateBidsSection;
  onPrivateSectionChange?: (section: PrivateBidsSection) => void;
  wallet?: WalletController;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [nowSeconds, setNowSeconds] = useState(() =>
    BigInt(Math.floor(Date.now() / 1_000)),
  );
  const index = state.data?.index ?? zeroIndex;
  const deploymentKind = state.data?.deploymentKind ?? deployment.kind;
  const deploymentVerified =
    state.data?.deploymentVerified ?? deployment.verified;
  const requestedFilter = searchParams.get("status");
  const publicFilter: PublicTenderFilter = isPublicTenderFilter(requestedFilter)
    ? requestedFilter
    : "current";

  useEffect(() => {
    if (activeRole !== "PUBLIC") return;
    const updateClock = () => {
      setNowSeconds(BigInt(Math.floor(Date.now() / 1_000)));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(timer);
  }, [activeRole]);

  const visibleTenders = useMemo(() => {
    const filtered = filterPublicTenders(
      index.tenders,
      publicFilter,
      nowSeconds,
    );
    return activeRole === "PUBLIC" ? filtered : index.tenders;
  }, [activeRole, index.tenders, nowSeconds, publicFilter]);
  const selectedId = searchParams.get("tender");
  const publicDetailOpen = searchParams.get("view") === "detail";
  const selected = useMemo(
    () =>
      visibleTenders.find(
        (tender) => tender.tenderId.toString() === selectedId,
      ) ??
      visibleTenders[0] ??
      null,
    [selectedId, visibleTenders],
  );

  function changePublicFilter(nextFilter: PublicTenderFilter) {
    const next = new URLSearchParams(searchParams);
    if (nextFilter === "current") next.delete("status");
    else next.set("status", nextFilter);
    if (
      selectedId &&
      !filterPublicTenders(index.tenders, nextFilter, nowSeconds).some(
        (tender) => tender.tenderId.toString() === selectedId,
      )
    ) {
      next.delete("tender");
      next.delete("view");
    }
    setSearchParams(next);
  }

  function scrollToPublicWorkspace() {
    window.setTimeout(() => {
      document.getElementById("tenders")?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function selectPublicTender(tenderId: bigint) {
    const next = new URLSearchParams(searchParams);
    next.set("tender", tenderId.toString());
    next.set("view", "detail");
    setSearchParams(next);
    scrollToPublicWorkspace();
  }

  function showPublicDossiers() {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next);
    scrollToPublicWorkspace();
  }

  function viewPublicAward(tenderId: bigint) {
    const next = new URLSearchParams(searchParams);
    next.delete("role");
    next.delete("buyer");
    next.delete("private");
    next.set("status", "awarded");
    next.set("tender", tenderId.toString());
    next.set("view", "detail");
    setSearchParams(next);
    scrollToPublicWorkspace();
  }

  function openActivityHistory() {
    const next = new URLSearchParams(searchParams);
    next.set("role", "activity");
    next.delete("status");
    next.delete("buyer");
    next.delete("private");
    next.delete("tender");
    next.delete("view");
    setSearchParams(next);
    window.setTimeout(() => {
      document.getElementById("award-notifications")?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  return (
    <div className="tender-layout">
      <div className="rolebar" aria-label="Tender workspaces">
        <div className="rolebar-links">
          {([
            ["PUBLIC", "PUBLIC"],
            ["BUYER", "BUYER"],
            ["PRIVATE BIDS", "PRIVATE BIDS"],
            ["ACTIVITY", "ACTIVITY"],
          ] as const).map(([role, label]) => {
              const interactive =
                role === "PUBLIC" ||
                role === "BUYER" ||
                role === "ACTIVITY" ||
                role === "PRIVATE BIDS";
              const enabled = role === "PUBLIC" || (interactive && Boolean(wallet));
              return (
                <button
                  key={role}
                  className={role === activeRole ? "active" : ""}
                  aria-pressed={role === activeRole}
                  disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    scrollToPageTop();
                    onRoleChange?.(role as RoomRole);
                  }}
                  title={
                    enabled
                      ? `${role} workspace`
                      : "Role workspace is not enabled in this release slice"
                  }
                >
                  {label}
                </button>
              );
            },
          )}
        </div>
        {wallet && <WalletBalancePanel wallet={wallet} />}
      </div>

      <div className="tender-surface">
        {wallet && (
          <WinnerNotificationBanner
            wallet={wallet}
            tenders={index.tenders}
            onViewAward={viewPublicAward}
            onOpenActivity={openActivityHistory}
          />
        )}
        {activeRole === "ACTIVITY" && wallet ? (
          <ActivityWorkspace
            wallet={wallet}
            tenders={index.tenders}
            onRefresh={onRetry}
            onViewAward={viewPublicAward}
          />
        ) : activeRole === "BUYER" && wallet ? (
          <BuyerWorkspace
            wallet={wallet}
            onRefresh={onRetry}
            section={buyerSection ?? "eoa"}
            onSectionChange={onBuyerSectionChange ?? (() => undefined)}
          />
        ) : activeRole === "PRIVATE BIDS" && wallet ? (
          <PrivateBidsWorkspace
            wallet={wallet}
            tenders={index.tenders}
            bids={index.bids}
            onRefresh={onRetry}
            section={privateSection ?? "submit"}
            onSectionChange={onPrivateSectionChange ?? (() => undefined)}
          />
        ) : (
          <main id="main-content">
            <section className="explorer-intro">
              <ContextHelp
                label="Help for Public workspace"
                title="HOW TO USE PUBLIC"
                steps={[
                  "Choose a confirmed tender from the dossier list.",
                  "Review its public ceiling, deadline, lifecycle, buyer, bid count, and award status.",
                  "Use refresh to reread confirmed Sepolia events when a transaction has just mined.",
                ]}
                note="No wallet is required. Bid prices and confidential balances never appear in this public index."
              />
              <div>
                <p className="eyebrow">CONFIDENTIAL PROCUREMENT / LIVE TEST STATE</p>
                <h1>
                  Public terms.
                  <br />
                  <em>Private bids.</em>
                </h1>
              </div>
              <div className="intro-copy">
                <p>
                  Browse confirmed tender coordination without connecting a
                  wallet. Recent records remain marked until finality; prices
                  and confidential balances are never indexed here.
                </p>
                <span className="deployment-label">
                  {deploymentKind.toUpperCase()} DEPLOYMENT ·{" "}
                  {deploymentVerified
                    ? "SOURCE/DEPLOYMENT VERIFIED"
                    : "NOT SOURCE/DEPLOYMENT VERIFIED"}
                </span>
              </div>
            </section>

            {state.status === "loading" && (
              <section className="state-panel" aria-live="polite">
                <span className="loading-mark" aria-hidden="true" />
                <div>
                  <h2>Reading confirmed Sepolia logs</h2>
                  <p>No placeholder tenders are shown while public state loads.</p>
                </div>
              </section>
            )}

            {state.status === "error" && (
              <section className="state-panel error" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <h2>Public state unavailable</h2>
                  <p>{state.error}</p>
                  <button className="secondary-button" onClick={onRetry}>
                    RETRY SEPOLIA →
                  </button>
                </div>
              </section>
            )}

            {state.status === "ready" && index.tenders.length === 0 && (
              <section className="state-panel">
                <span aria-hidden="true">0</span>
                <div>
                  <h2>No confirmed tenders found</h2>
                  <p>The explorer is connected; no public tender events exist yet.</p>
                </div>
              </section>
            )}

            {state.status === "ready" && state.data && (
              <section
                className={`explorer-grid${publicDetailOpen ? " show-mobile-detail" : ""}`}
                id="tenders"
              >
                <aside className="dossier-list" aria-label="Public tenders">
                  <div className="dossier-list-controls">
                    <header>
                      <div>
                        <p className="eyebrow">CONFIRMED DOSSIERS</p>
                        <h2>{visibleTenders.length} tenders</h2>
                      </div>
                      <button
                        className="icon-button"
                        onClick={onRetry}
                        aria-label="Refresh confirmed Sepolia state"
                      >
                        ↻
                      </button>
                    </header>
                    <label className="public-filter-control">
                      <span>Show</span>
                      <select
                        aria-label="Filter public tenders"
                        value={publicFilter}
                        onChange={(event) =>
                          changePublicFilter(
                            event.target.value as PublicTenderFilter,
                          )
                        }
                      >
                        {publicTenderFilters.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {visibleTenders.length === 0 && (
                    <p className="form-empty-hint">
                      No tenders match this filter. Choose “All tenders” to
                      inspect cancelled and refunded history.
                    </p>
                  )}
                  {visibleTenders.map((tender) => (
                    <TenderCard
                      key={tender.tenderId.toString()}
                      tender={tender}
                      selected={selected.tenderId === tender.tenderId}
                      onSelect={() => selectPublicTender(tender.tenderId)}
                      nowSeconds={nowSeconds}
                    />
                  ))}
                </aside>
                {selected ? (
                  <div className="public-detail-column">
                    <div className="public-mobile-toolbar">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={showPublicDossiers}
                      >
                        ← ALL DOSSIERS
                      </button>
                      <span>TENDER {selected.tenderId.toString()}</span>
                    </div>
                    <TenderDetail
                      tender={selected}
                      indexedBlock={state.data.indexedBlock}
                      finalizedBlock={state.data.finalizedBlock}
                      nowSeconds={nowSeconds}
                    />
                  </div>
                ) : (
                  <section className="state-panel">
                    <span aria-hidden="true">0</span>
                    <div>
                      <h2>No tenders match this filter</h2>
                      <p>
                        Choose “All tenders” to inspect the public history.
                      </p>
                    </div>
                  </section>
                )}
              </section>
            )}
          </main>
        )}

        <footer id="evidence">
          <div>
            <span className="wordmark inverted">VEILBID</span>
            <p>Confidential procurement for Safe treasuries.</p>
          </div>
          <div className="footer-meta">
            <span>ETHEREUM SEPOLIA</span>
            <span>TEST ASSETS ONLY</span>
            <span>UNAUDITED HACKATHON SOFTWARE</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TenderRoomApp({ wallet }: { wallet: WalletController }) {
  const { state, refresh } = usePublicMarket();
  const [roomParams, setRoomParams] = useSearchParams();
  const requestedRole = roomParams
    .get("role")
    ?.toUpperCase()
    .replace(/[-_]+/g, " ");
  const buyerSection: BuyerSection =
    roomParams.get("buyer") === "safe" ? "safe" : "eoa";
  const privateSection: PrivateBidsSection =
    requestedRole === "AUDITOR" || roomParams.get("private") === "granted-access"
      ? "granted-access"
      : roomParams.get("private") === "my-bid"
      ? "my-bid"
        : "submit";
  const activeRole: RoomRole =
    requestedRole === "BUYER" || requestedRole === "SAFE TREASURY"
      ? "BUYER"
      : requestedRole === "PRIVATE BIDS" ||
          requestedRole === "VENDOR" ||
          requestedRole === "AUDITOR"
        ? "PRIVATE BIDS"
        : requestedRole === "ACTIVITY"
          ? "ACTIVITY"
          : "PUBLIC";
  const setActiveRole = (role: RoomRole) => {
    const next = new URLSearchParams(roomParams);
    if (role === "PUBLIC") next.delete("role");
    else if (role === "VENDOR") next.set("role", "private-bids");
    else if (role === "SAFE TREASURY") next.set("role", "buyer");
    else next.set("role", role.toLowerCase());
    setRoomParams(next);
  };
  const setBuyerSection = (section: BuyerSection) => {
    const next = new URLSearchParams(roomParams);
    if (section === "eoa") next.delete("buyer");
    else next.set("buyer", section);
    next.set("role", "buyer");
    setRoomParams(next);
  };
  const setPrivateSection = (section: PrivateBidsSection) => {
    const next = new URLSearchParams(roomParams);
    if (section === "submit") next.delete("private");
    else next.set("private", section);
    next.set("role", "private-bids");
    setRoomParams(next);
  };
  return (
    <ExplorerView
      state={state}
      onRetry={() => void refresh()}
      activeRole={activeRole}
      onRoleChange={setActiveRole}
      buyerSection={buyerSection}
      onBuyerSectionChange={setBuyerSection}
      privateSection={privateSection}
      onPrivateSectionChange={setPrivateSection}
      wallet={wallet}
    />
  );
}

export function App() {
  const location = useLocation();
  const wallet = useWallet();
  const legacyRoomLink =
    new URLSearchParams(location.search).has("role") ||
    new URLSearchParams(location.search).has("tender");
  const page =
    location.pathname === "/docs" ? (
      <DocsPage />
    ) : location.pathname === "/flare" ? (
      <FlareRoom />
    ) : location.pathname === "/room" || legacyRoomLink ? (
      <TenderRoomApp wallet={wallet} />
    ) : (
      <LandingPage />
    );
  return (
    <>
      <PrimaryNavigation wallet={wallet} />
      {page}
    </>
  );
}

export type { LoadedPublicMarket };
