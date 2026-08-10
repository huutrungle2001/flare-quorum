import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { ContextHelp } from "../shell/ContextHelp";
import { useToasts } from "../shell/ToastProvider";
import { WalletPanel, type WalletController } from "../wallet/WalletPanel";
import {
  approveAndExecuteSafeProposal,
  assertSafeCeilingWithinRevealedBalance,
  authorizeSafeBalanceViewer,
  depositWalletTestUsdcToSafe,
  deployPersonalSafe,
  discoverOwnerSafes,
  finalizeSafeUnwrap,
  findSafeUnwrapRequest,
  getSafeProposalStatus,
  inspectSafeConfiguration,
  parseSafeTenderInput,
  prepareSafeTender,
  revealSafeConfidentialBalance,
  safeReleaseConfiguration,
  safeWalletUrl,
  serializeSafeTransactionHandoff,
  setupSafeForFlareQuorum,
  unwrapFullSafeConfidentialBalance,
  unwrapPartialSafeConfidentialBalance,
  verifyOwnedSafes,
  type SafeAccountConfiguration,
  type SafePreparationResult,
  type SafeProposalStatus,
  type SafeTenderInput,
  type SafeUnwrapFinalization,
  type SafeUnwrapRequest,
} from "./safePreparation";
import {
  loadSafeProposals,
  rememberSafeProposal,
  type StoredSafeProposal,
} from "./safeProposalStore";
import {
  loadRememberedOwnerSafes,
  rememberOwnerSafe,
} from "./safeAccountStore";
import {
  confirmCreatedTenderFunding,
  findCreatedTenderId,
  type FundingConfirmationStage,
} from "../transactions/tenderFunding";
import { transactionErrorMessage } from "../transactions/errors";

const emptyInput: SafeTenderInput = {
  metadata: "",
  ceiling: "",
  deadline: "",
  vendors: "",
};

const fundingStageLabel: Record<FundingConfirmationStage, string> = {
  reading: "Reading the new tender funding state",
  "requesting-proof": "Waiting for the public Nox funding proof",
  simulating: "Simulating exact-funding confirmation",
  signing: "Confirm funding in your wallet",
  confirming: "Waiting for Sepolia to open the tender",
  open: "Exact funding confirmed; tender is Open",
  cancelled: "Funding was insufficient; tender is Cancelled",
};

function minimumSafeDeadline() {
  const deadline = new Date(Date.now() + 300_000);
  deadline.setMinutes(
    deadline.getMinutes() - deadline.getTimezoneOffset(),
  );
  return deadline.toISOString().slice(0, 16);
}

function shortAddress(value: Address) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function safeActionTitle(result: SafePreparationResult) {
  if (result.kind === "setup") return "Safe setup";
  if (result.kind === "fund") return "Safe funding";
  if (result.kind === "view-balance") return "Balance viewer";
  if (result.kind === "withdraw-eth") return "ETH withdrawal";
  if (result.kind === "withdraw-usdc") return "vUSDC withdrawal";
  if (result.kind === "unwrap") return "vcUSDC unwrap";
  return "Tender batch";
}

function safeActionLabel(kind: StoredSafeProposal["kind"]) {
  if (kind === "setup") return "FLAREQUORUM SETUP";
  if (kind === "fund") return "SAFE FUNDING";
  if (kind === "tender") return "CREATE TENDER";
  if (kind === "view-balance") return "BALANCE VIEW";
  if (kind === "withdraw-eth") return "ETH WITHDRAWAL";
  if (kind === "withdraw-usdc") return "vUSDC WITHDRAWAL";
  return "vcUSDC UNWRAP";
}

function isTemporaryRpcError(cause: unknown) {
  const messages: string[] = [];
  let current: unknown = cause;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    if (typeof current === "object") {
      const details = (current as { details?: unknown }).details;
      if (typeof details === "string") messages.push(details);
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return /(failed to fetch|fetch failed|http request failed|network|timeout|timed out|429|502|503|504)/i
    .test(messages.join(" "));
}

export function SafeActionHandoff({
  result,
  busy = false,
  onRefresh,
  onApprove,
}: {
  result: SafePreparationResult;
  busy?: boolean;
  onRefresh?: () => void;
  onApprove?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  if (result.executed) return null;

  async function copy(label: string, value: string) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus("Clipboard unavailable. Select and copy the value manually.");
    }
  }

  return (
    <section className="safe-handoff" aria-label="Safe transaction handoff">
      <div>
        <p className="eyebrow">SAFE TRANSACTION SERVICE</p>
        <h3>
          {safeActionTitle(result)} {result.executed ? "executed" : "published"}
        </h3>
        <p>
          The proposal is recoverable from its public Safe transaction hash.
          Raw calls remain available as a manual handoff.
        </p>
      </div>
      <label>
        <span>Target contract</span>
        <input readOnly value={result.target} aria-label="Safe target contract" />
      </label>
      <button
        className="secondary-button"
        type="button"
        onClick={() => void copy("Target", result.target)}
      >
        COPY TARGET
      </button>
      <label className="safe-calldata-field">
        <span>Last transaction calldata</span>
        <textarea
          readOnly
          value={result.safeTransactionData}
          aria-label="Safe transaction calldata"
        />
      </label>
      <div className="safe-handoff-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => void copy("Calldata", result.safeTransactionData)}
        >
          COPY CALLDATA
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            void copy("Transaction JSON", serializeSafeTransactionHandoff(result))
          }
        >
          COPY BATCH JSON
        </button>
        <a
          className="secondary-button"
          href={safeWalletUrl(result.safe)}
          target="_blank"
          rel="noreferrer"
        >
          OPEN SAFE ↗
        </a>
      </div>
      <dl className="safe-handoff-evidence">
        <div>
          <dt>Safe</dt>
          <dd>{result.safe}</dd>
        </div>
        {result.actionHash && (
          <div>
            <dt>Action hash</dt>
            <dd>{result.actionHash}</dd>
          </div>
        )}
        <div>
          <dt>Safe transaction hash</dt>
          <dd>{result.safeTxHash}</dd>
        </div>
        <div>
          <dt>Threshold progress</dt>
          <dd>{result.confirmations} / {result.threshold} approvals</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>
            {result.executionTransactionHash ? (
              <a
                href={`https://sepolia.etherscan.io/tx/${result.executionTransactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Confirmed on Sepolia ↗
              </a>
            ) : "Waiting for threshold"}
          </dd>
        </div>
      </dl>
      <div className="safe-handoff-actions">
        {onRefresh && (
          <button className="secondary-button" disabled={busy} onClick={onRefresh}>
            REFRESH SIGNATURES ↻
          </button>
        )}
        {!result.executed && onApprove && (
          <button className="primary-button" disabled={busy} onClick={onApprove}>
            APPROVE / EXECUTE →
          </button>
        )}
      </div>
      {copyStatus && (
        <p className="result-line" aria-live="polite">{copyStatus}</p>
      )}
    </section>
  );
}

function SafeConfigurationCard({
  configuration,
  revealedConfidentialBalance,
  busy,
  revealPending,
  onRefresh,
  onToggleReveal,
  depositControl,
  unwrapControl,
}: {
  configuration: SafeAccountConfiguration;
  revealedConfidentialBalance: bigint | null;
  busy: boolean;
  revealPending: boolean;
  onRefresh: () => void;
  onToggleReveal: () => void;
  depositControl: ReactNode;
  unwrapControl: ReactNode;
}) {
  const hasConfidentialBalance =
    configuration.balances.confidential === "encrypted";
  const confidentialBalanceLabel =
    revealedConfidentialBalance !== null
      ? formatUnits(revealedConfidentialBalance, 6)
      : hasConfidentialBalance
        ? "••••••"
        : configuration.balances.confidential === "none"
          ? "0"
          : "Unavailable";
  return (
    <section className="safe-account-card" aria-label="Selected Safe status">
      <div className="safe-selected-heading">
        <div className="form-heading">
          <p className="eyebrow">SELECTED SAFE</p>
          <h2>{shortAddress(configuration.safe)}</h2>
          <p>
            {configuration.owners.length} owner(s) · threshold{" "}
            {configuration.threshold}
          </p>
          <ContextHelp
            compact
            label="Help for selected Safe"
            title="HOW TO READ SELECTED SAFE"
            steps={[
              "This card shows the Safe currently used for FlareQuorum treasury actions.",
              "The owner count and threshold determine how many Safe approvals are required.",
              "Use Refresh or Open Safe to verify the public on-chain account.",
            ]}
          />
        </div>
        <div className="safe-section-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onRefresh}
            aria-label="Refresh selected Safe"
          >
            REFRESH ↻
          </button>
          <a
            className="secondary-button"
            href={safeWalletUrl(configuration.safe)}
            target="_blank"
            rel="noreferrer"
          >
            OPEN SAFE ↗
          </a>
        </div>
      </div>
      <section className="safe-funds" aria-label="Selected Safe funds">
        <div className="safe-funds-heading">
          <div>
            <p className="eyebrow">SAFE FUNDS</p>
            <h3>Confidential tender funds</h3>
          </div>
          <ContextHelp
            compact
            label="Help for Safe funds"
            title="HOW TO USE SAFE FUNDS"
            steps={[
              "The vcUSDC amount stays masked until this owner authorizes a private reveal.",
              "Deposit uses public vUSDC from the connected wallet and mints vcUSDC to this Safe.",
              "The eye only reveals the value in this browser session; it does not make the balance public on-chain.",
            ]}
          />
          <dl className="safe-funds-balance">
            <div>
              <dt>vcUSDC</dt>
              <dd>
                <span className="confidential-balance">
                  <span>{confidentialBalanceLabel}</span>
                  <button
                    className="balance-reveal safe-balance-eye"
                    type="button"
                    onClick={onToggleReveal}
                    disabled={!hasConfidentialBalance || busy || revealPending}
                    aria-label={
                      !hasConfidentialBalance
                        ? "No confidential vcUSDC balance to reveal"
                        : !configuration.confidentialViewerAuthorized
                          ? "Authorize and reveal confidential Safe balance"
                          : revealedConfidentialBalance === null
                            ? "Reveal confidential Safe balance"
                            : "Hide confidential Safe balance"
                    }
                    title={
                      !hasConfidentialBalance
                        ? "No vcUSDC balance"
                        : !configuration.confidentialViewerAuthorized
                          ? "Authorize this owner for the current balance handle"
                          : revealedConfidentialBalance === null
                            ? "Reveal vcUSDC"
                            : "Hide vcUSDC"
                    }
                  >
                    {revealedConfidentialBalance === null ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                        <path d="m4 4 16 16" />
                        <path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.9M14.4 17.7A10 10 0 0 1 12 18c-6 0-9.5-6-9.5-6a17 17 0 0 1 3.1-3.7" />
                      </svg>
                    )}
                  </button>
                </span>
              </dd>
            </div>
          </dl>
        </div>
        {depositControl}
        {unwrapControl}
      </section>
    </section>
  );
}

function SafeDepositControl({
  amount,
  busy,
  onAmountChange,
  onFund,
}: {
  amount: string;
  busy: boolean;
  onAmountChange: (amount: string) => void;
  onFund: () => void;
}) {
  return (
    <section
      className="safe-inline-deposit"
      aria-label="Deposit vcUSDC to selected Safe"
    >
      <div className="safe-inline-heading">
        <div>
          <p className="eyebrow">SAFE DEPOSIT</p>
          <strong>Move public vUSDC into this treasury</strong>
        </div>
        <ContextHelp
          compact
          label="Help for Safe deposit"
          title="HOW TO DEPOSIT TO SAFE"
          steps={[
            "Enter the public vUSDC amount available in the connected wallet.",
            "Approve the wrapper if needed, then confirm the deposit transaction.",
            "The resulting vcUSDC is held by the Safe and can fund a tender.",
          ]}
          note="This action uses the connected EOA wallet, not a Safe owner proposal."
        />
      </div>
      <div className="safe-inline-funding">
        <label>
          <span>vcUSDC amount</span>
          <input
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={onFund}
        >
          DEPOSIT TO SAFE →
        </button>
      </div>
      <p className="safe-deposit-note">
        Uses public vUSDC from the connected wallet and mints vcUSDC directly
        to this Safe. Get test vUSDC from the wallet balance panel first.
      </p>
    </section>
  );
}

function SafeTenderSetup({
  configuration,
  busy,
  onSetup,
}: {
  configuration: SafeAccountConfiguration;
  busy: boolean;
  onSetup: () => void;
}) {
  if (configuration.ready) {
    return (
      <section
        className="safe-tender-setup is-ready"
        aria-label="Safe tender setup"
      >
        <div>
          <p className="eyebrow">TENDER SETUP</p>
          <strong>Module enabled · Market bound · Settlement authorized</strong>
          <ContextHelp
            compact
            label="Help for completed Safe setup"
            title="SAFE SETUP COMPLETE"
            steps={[
              "The dedicated module is deployed and enabled for this Safe.",
              "The FlareQuorum Market is bound and can receive Safe-owned tender preparation calls.",
              "No setup proposal is needed again unless the Safe or deployment changes.",
            ]}
          />
        </div>
        <span className="safe-ready-badge">SAFE READY ✓</span>
      </section>
    );
  }
  const checks = [
    ["Module contract", configuration.moduleDeployed],
    ["Module enabled", configuration.moduleEnabled],
    ["Market configured", configuration.marketConfigured],
    ["Settlement authority", configuration.marketAuthorized],
  ] as const;
  return (
    <section className="safe-tender-setup" aria-label="Safe tender setup">
      <div className="safe-tender-setup-heading">
        <div>
          <p className="eyebrow">TENDER SETUP</p>
          <h3>One-time FlareQuorum setup</h3>
          <p>
            Required only for Safe-owned tender creation. Setup deploys and
            enables the dedicated module, binds the Market, and grants
            settlement authority in one Safe proposal.
          </p>
          <ContextHelp
            compact
            label="Help for Safe tender setup"
            title="WHY CONFIGURE THIS SAFE"
            steps={[
              "Run this once before the Safe creates its first tender.",
              "The proposal deploys/enables the Safe module, binds Market, and grants settlement authority.",
              "After execution, the CREATE WITH SAFE action becomes available.",
            ]}
          />
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={busy || !configuration.module}
          onClick={onSetup}
        >
          CONFIGURE THIS SAFE →
        </button>
      </div>
      {!configuration.module && (
        <p className="inline-error">
          Generic Safe setup is unavailable until the module factory is
          deployed in the release configuration.
        </p>
      )}
      <ul className="safe-readiness-list">
        {checks.map(([label, passed]) => (
          <li key={label} data-ready={passed}>
            <span aria-hidden="true">{passed ? "✓" : "○"}</span> {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SafeUnwrapControl({
  configuration,
  fullBalance,
  amount,
  recipient,
  revealedBalance,
  request,
  finalization,
  busy,
  finalizing,
  onFullBalance,
  onAmountChange,
  onReveal,
  onRequest,
  onFinalize,
}: {
  configuration: SafeAccountConfiguration;
  fullBalance: boolean;
  amount: string;
  recipient: Address;
  revealedBalance: bigint | null;
  request: SafeUnwrapRequest | null;
  finalization: SafeUnwrapFinalization | null;
  busy: boolean;
  finalizing: boolean;
  onFullBalance: () => void;
  onAmountChange: (amount: string) => void;
  onReveal: () => void;
  onRequest: () => void;
  onFinalize: () => void;
}) {
  const hasConfidentialBalance =
    configuration.balances.confidential === "encrypted";
  const customReady = revealedBalance !== null;
  return (
    <section className="safe-unwrap-action" aria-label="Unwrap Safe vcUSDC">
      <div className="safe-unwrap-heading">
        <div>
          <p className="eyebrow">CONFIDENTIAL → PUBLIC</p>
          <h3>Unwrap vcUSDC</h3>
          <p>
            Enter a custom amount after privately revealing the balance, or use
            Full to consume the encrypted balance directly without revealing it.
            Unwrap releases public vUSDC to your connected wallet.
          </p>
        </div>
        <ContextHelp
          compact
          label="Help for Safe vcUSDC unwrap"
          title="HOW TO UNWRAP vcUSDC"
          steps={[
            "Choose FULL to consume the encrypted balance, or reveal privately before entering a custom amount.",
            "Propose the Safe action and complete its threshold approvals.",
            "After execution, finalize the public proof to release vUSDC to the connected wallet.",
          ]}
          note="Only the finalized amount and recipient become public; remaining vcUSDC stays confidential."
        />
      </div>
      <div className="safe-unwrap-fields">
        <label>
          <span>vcUSDC amount</span>
          <div className="safe-amount-input">
            <input
              value={fullBalance ? "FULL BALANCE" : amount}
              onChange={(event) => onAmountChange(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              disabled={!customReady || fullBalance}
              aria-label="Custom vcUSDC unwrap amount"
            />
            <button
              type="button"
              aria-pressed={fullBalance}
              onClick={onFullBalance}
              title="Use the encrypted full balance without revealing it"
            >
              {fullBalance ? "FULL ✓" : "FULL"}
            </button>
          </div>
        </label>
        <div className="safe-unwrap-recipient">
          <span>PUBLIC vUSDC RECIPIENT</span>
          <strong>{shortAddress(recipient)}</strong>
          <small>Connected wallet · fixed for this proposal</small>
        </div>
      </div>
      {!fullBalance && revealedBalance === null && (
        <div className="safe-unwrap-reveal">
          <span>
            Custom amount needs the current balance revealed in this browser
            session to prevent an invalid overdraw.
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={!hasConfidentialBalance || busy}
            onClick={onReveal}
          >
            {configuration.confidentialViewerAuthorized
              ? "REVEAL BALANCE"
              : "AUTHORIZE BALANCE VIEW"}
          </button>
        </div>
      )}
      {!fullBalance && customReady && (
        <p className="safe-unwrap-available">
          Available privately: {formatUnits(revealedBalance, 6)} vcUSDC
        </p>
      )}
      <div className="safe-unwrap-warning">
        <strong>PRIVACY CHANGE</strong>
        <span>
          Finalization makes the unwrapped amount and recipient public.
          Remaining vcUSDC and all bid values stay confidential.
        </span>
      </div>
      <button
        className="primary-button safe-unwrap-submit"
        type="button"
        disabled={
          busy ||
          !hasConfidentialBalance ||
          (!fullBalance && !customReady)
        }
        onClick={onRequest}
      >
        PROPOSE {fullBalance ? "FULL" : "CUSTOM"} UNWRAP →
      </button>
      {request && (
        <div className="safe-unwrap-finalize">
          <div>
            <strong>UNWRAP REQUEST READY</strong>
            <small>Receiver {shortAddress(request.receiver)}</small>
          </div>
          {finalization ? (
            <a
              className="secondary-button"
              href={`https://sepolia.etherscan.io/tx/${finalization.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {formatUnits(finalization.plaintextAmount, 6)} vUSDC RELEASED ↗
            </a>
          ) : request.finalized ? (
            <strong>ALREADY FINALIZED ON-CHAIN</strong>
          ) : (
            <button
              className="primary-button"
              type="button"
              disabled={busy || finalizing}
              onClick={onFinalize}
            >
              {finalizing ? "FINALIZING…" : "FINALIZE UNWRAP →"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function SafeConfigurationSkeleton({ safe }: { safe: Address }) {
  return (
    <section
      className="safe-account-card safe-account-loading"
      aria-label="Reading selected Safe"
      aria-live="polite"
    >
      <div className="form-heading">
        <p className="eyebrow">READING SELECTED SAFE</p>
        <h2>{shortAddress(safe)}</h2>
        <p>Checking owners, threshold, vcUSDC, and FlareQuorum setup on Sepolia…</p>
      </div>
      <div className="safe-skeleton-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="safe-skeleton-line" aria-hidden="true" />
    </section>
  );
}

export function SafeTreasuryWorkspace({
  wallet,
  onRefresh,
}: {
  wallet: WalletController;
  onRefresh: () => void;
}) {
  const toasts = useToasts();
  const [input, setInput] = useState(emptyInput);
  const [ownerSafes, setOwnerSafes] = useState<Address[]>([]);
  const [safeInput, setSafeInput] = useState("");
  const [selectedSafe, setSelectedSafe] = useState<Address | null>(null);
  const [configuration, setConfiguration] =
    useState<SafeAccountConfiguration | null>(null);
  const [configurationCache, setConfigurationCache] = useState<
    Record<string, SafeAccountConfiguration>
  >({});
  const configurationCacheRef = useRef<
    Record<string, SafeAccountConfiguration>
  >({});
  const inspectionRequestId = useRef(0);
  const recoveredUnwrapTransactions = useRef(new Set<string>());
  const [lastUsedSafe, setLastUsedSafe] = useState<Address | null>(null);
  const [loadingSafe, setLoadingSafe] = useState<Address | null>(null);
  const [safeReadWarning, setSafeReadWarning] = useState<string | null>(null);
  const [revealedSafeBalance, setRevealedSafeBalance] = useState<{
    handle: Hex;
    value: bigint;
  } | null>(null);
  const [revealPending, setRevealPending] = useState(false);
  const [unwrapFullBalance, setUnwrapFullBalance] = useState(false);
  const [unwrapAmount, setUnwrapAmount] = useState("");
  const [unwrapRequest, setUnwrapRequest] =
    useState<SafeUnwrapRequest | null>(null);
  const [unwrapRequestSafe, setUnwrapRequestSafe] =
    useState<Address | null>(null);
  const [unwrapFinalization, setUnwrapFinalization] =
    useState<SafeUnwrapFinalization | null>(null);
  const [unwrapStage, setUnwrapStage] = useState<string | null>(null);
  const [discoveryStage, setDiscoveryStage] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenderValidationError, setTenderValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<SafePreparationResult | null>(null);
  const [fundAmount, setFundAmount] = useState("100");
  const [storedProposals, setStoredProposals] = useState<StoredSafeProposal[]>([]);
  const [storedStatuses, setStoredStatuses] = useState<
    Record<string, SafeProposalStatus>
  >({});
  const connected = Boolean(
    wallet.state.status === "connected" &&
    wallet.state.account &&
    wallet.state.walletClient,
  );

  const refreshConfiguration = useCallback(async (
    safe: Address,
    account: Address,
  ) => {
    const requestId = ++inspectionRequestId.current;
    const cacheKey = safe.toLowerCase();
    const cached = configurationCacheRef.current[cacheKey] ?? null;

    setSelectedSafe(safe);
    setLoadingSafe(safe);
    setConfiguration(cached);
    setStoredProposals(
      loadSafeProposals().filter(
        (proposal) => proposal.safe.toLowerCase() === cacheKey,
      ),
    );
    setError(null);
    setTenderValidationError(null);
    setSafeReadWarning(null);
    try {
      const inspected = await inspectSafeConfiguration({ safe, account });
      if (inspectionRequestId.current !== requestId) return null;

      configurationCacheRef.current = {
        ...configurationCacheRef.current,
        [cacheKey]: inspected,
      };
      setConfigurationCache(configurationCacheRef.current);
      setConfiguration(inspected);
      setRevealedSafeBalance((current) =>
        current?.handle === inspected.balances.confidentialHandle
          ? current
          : null,
      );
      rememberOwnerSafe(account, safe);
      setLastUsedSafe(safe);
      setOwnerSafes((current) =>
        current.some((candidate) => candidate.toLowerCase() === cacheKey)
          ? current
          : [...current, safe],
      );
      return inspected;
    } catch (cause) {
      if (inspectionRequestId.current !== requestId) return null;
      if (cached && isTemporaryRpcError(cause)) {
        setConfiguration(cached);
        setSafeReadWarning(
          "Live Sepolia refresh failed after trying backup RPCs. Showing the last successful read.",
        );
        return cached;
      } else {
        setConfiguration(null);
        setError(
          isTemporaryRpcError(cause)
            ? "Sepolia RPC is temporarily unavailable after trying backup providers. Please try again."
            : cause instanceof Error
              ? cause.message
              : "Safe inspection failed.",
        );
        return null;
      }
    } finally {
      if (inspectionRequestId.current === requestId) {
        setLoadingSafe(null);
      }
    }
  }, []);

  useEffect(() => {
    setStage(null);
    setError(null);
    setTenderValidationError(null);
    setResult(null);
    setConfiguration(null);
    setSelectedSafe(null);
    setLastUsedSafe(null);
    setLoadingSafe(null);
    setSafeReadWarning(null);
    setRevealedSafeBalance(null);
    setRevealPending(false);
    setUnwrapFullBalance(false);
    setUnwrapAmount("");
    setUnwrapRequest(null);
    setUnwrapRequestSafe(null);
    setUnwrapFinalization(null);
    setUnwrapStage(null);
    recoveredUnwrapTransactions.current.clear();
    setOwnerSafes([]);
    setStoredProposals([]);
    configurationCacheRef.current = {};
    setConfigurationCache({});
    inspectionRequestId.current += 1;
    if (!connected) return;
    let cancelled = false;
    const account = wallet.state.account!;
    setDiscoveryStage("Finding Sepolia Safes owned by this wallet…");
    void (async () => {
      const remembered = loadRememberedOwnerSafes(account);
      let discovered: Address[] = [];
      let discoveryFailed = false;
      try {
        discovered = await discoverOwnerSafes(account);
      } catch {
        discoveryFailed = true;
      }
      const verified = await verifyOwnedSafes({
        account,
        safes: [...remembered, ...discovered],
      });
      if (cancelled) return;
      setOwnerSafes(verified);
      setLastUsedSafe(
        remembered.find((safe) =>
          verified.some(
            (candidate) =>
              candidate.toLowerCase() === safe.toLowerCase(),
          ),
        ) ?? null,
      );
      setDiscoveryStage(null);
      if (discoveryFailed && verified.length === 0) {
        setError(
          "Safe discovery service is unavailable. Paste a Sepolia Safe address below.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet.state.sessionRevision, connected]);

  useEffect(() => {
    if (!connected || storedProposals.length === 0) return;
    let cancelled = false;
    let timer: number | null = null;

    const readStatuses = async () => {
      const settled = await Promise.all(
        storedProposals.map(async (proposal) => {
          try {
            return {
              proposal,
              status: await getSafeProposalStatus(proposal.safeTxHash),
            };
          } catch {
            return { proposal, status: null };
          }
        }),
      );
      if (cancelled) return;
      setStoredStatuses((current) => {
        const next = { ...current };
        for (const { proposal, status } of settled) {
          if (status) next[proposal.safeTxHash] = status;
        }
        return next;
      });

      let retryUnwrapRecovery = false;
      for (const { proposal, status } of settled) {
        const executionHash = status?.executionTransactionHash;
        if (
          proposal.kind !== "unwrap" ||
          !status?.executed ||
          !executionHash ||
          recoveredUnwrapTransactions.current.has(executionHash)
        ) {
          continue;
        }
        recoveredUnwrapTransactions.current.add(executionHash);
        try {
          const request = await findSafeUnwrapRequest(executionHash);
          if (cancelled) return;
          setUnwrapRequest(request);
          setUnwrapRequestSafe(proposal.safe);
          setUnwrapFinalization(null);
        } catch {
          recoveredUnwrapTransactions.current.delete(executionHash);
          retryUnwrapRecovery = true;
        }
      }

      if (
        !cancelled &&
        (retryUnwrapRecovery ||
          settled.some(({ status }) => !status || !status.executed))
      ) {
        timer = window.setTimeout(() => void readStatuses(), 12_000);
      }
    };

    void readStatuses();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [connected, storedProposals]);

  function remember(resultToStore: SafePreparationResult) {
    rememberSafeProposal({
      kind: resultToStore.kind,
      safe: resultToStore.safe,
      safeTxHash: resultToStore.safeTxHash,
      createdAt: new Date().toISOString(),
    });
    setStoredProposals(
      loadSafeProposals().filter(
        (proposal) =>
          proposal.safe.toLowerCase() === resultToStore.safe.toLowerCase(),
      ),
    );
  }

  async function selectSafe() {
    if (!connected) return;
    if (!isAddress(safeInput)) {
      setError("Enter a valid Sepolia Safe address.");
      return;
    }
    await refreshConfiguration(
      getAddress(safeInput),
      wallet.state.account!,
    );
  }

  async function createSafe() {
    if (!connected) return;
    const toastId = toasts.startStack(
      "CREATE PERSONAL SAFE",
      "Preparing a new one-owner Safe on Sepolia…",
    );
    setError(null);
    setResult(null);
    try {
      const deployed = await deployPersonalSafe({
        provider: wallet.state.selectedProvider!.provider,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setDiscoveryStage(nextStage);
          toasts.update(toastId, nextStage);
        },
      });
      setOwnerSafes((current) =>
        current.some(
          (safe) => safe.toLowerCase() === deployed.safe.toLowerCase(),
        )
          ? current
          : [...current, deployed.safe],
      );
      await refreshConfiguration(
        deployed.safe,
        wallet.state.account!,
      );
      toasts.succeed(
        toastId,
        "Personal Safe created. Complete the one-time FlareQuorum setup next.",
      );
    } catch (cause) {
      const message = transactionErrorMessage(cause, "Safe deployment failed.");
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setDiscoveryStage(null);
    }
  }

  async function runAction(
    label: string,
    action: (onStage: (next: string) => void) => Promise<SafePreparationResult>,
    options: {
      refreshAfter?: boolean;
      afterExecution?: (
        completed: SafePreparationResult,
        onStage: (next: string) => void,
      ) => Promise<string | null>;
    } = {},
  ) {
    const toastId = toasts.startStack(
      label,
      "Building a threshold-authorized Safe action…",
    );
    setStage("Building a threshold-authorized Safe action");
    setError(null);
    setResult(null);
    let completed: SafePreparationResult | null = null;
    try {
      const actionResult = await action((nextStage) => {
        setStage(nextStage);
        toasts.update(toastId, nextStage);
      });
      completed = actionResult;
      setResult(actionResult);
      remember(actionResult);
      setStoredStatuses((current) => ({
        ...current,
        [actionResult.safeTxHash]: {
          safeTxHash: actionResult.safeTxHash,
          threshold: actionResult.threshold,
          confirmations: actionResult.confirmations,
          executed: actionResult.executed,
          executionTransactionHash: actionResult.executionTransactionHash,
        },
      }));
      let completionMessage: string | null = null;
      if (actionResult.executed && options.afterExecution) {
        completionMessage = await options.afterExecution(
          actionResult,
          (nextStage) => {
            setStage(nextStage);
            toasts.update(toastId, nextStage);
          },
        );
      }
      toasts.succeed(
        toastId,
        completionMessage ?? (actionResult.executed
          ? "Safe batch executed on Sepolia."
          : "Safe proposal published for the remaining approvals."),
      );
      if (
        actionResult.executed &&
        wallet.state.account &&
        options.refreshAfter !== false
      ) {
        await refreshConfiguration(actionResult.safe, wallet.state.account);
      }
      return actionResult;
    } catch (cause) {
      const message = transactionErrorMessage(cause, "Safe action failed.");
      setError(
        completed?.executed
          ? `The Safe action executed, but its follow-up stopped. ${message}`
          : message,
      );
      toasts.fail(
        toastId,
        completed?.executed
          ? "Safe action executed; the recoverable follow-up stopped."
          : message,
      );
      if (completed?.executed && wallet.state.account) {
        await refreshConfiguration(completed.safe, wallet.state.account);
      }
      if (completed?.kind === "tender") onRefresh();
      return completed;
    } finally {
      setStage(null);
    }
  }

  async function setup() {
    if (!connected || !configuration) return;
    await runAction("CONFIGURE SAFE", (onStage) =>
      setupSafeForFlareQuorum({
        configuration,
        provider: wallet.state.selectedProvider!.provider,
        account: wallet.state.account!,
        onStage,
      }),
    );
  }

  async function fund() {
    if (!connected || !configuration) return;
    let amount: bigint;
    try {
      amount = parseUnits(fundAmount, 6);
      if (amount <= 0n) throw new Error();
    } catch {
      setError("Enter a positive funding amount with at most 6 decimals.");
      return;
    }
    const toastId = toasts.startStack(
      "DEPOSIT TO SAFE",
      "Checking connected-wallet vUSDC…",
    );
    setError(null);
    setResult(null);
    try {
      const deposited = await depositWalletTestUsdcToSafe({
        safe: configuration.safe,
        amount,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setStage(nextStage);
          toasts.update(toastId, nextStage);
        },
      });
      toasts.succeed(
        toastId,
        `${formatUnits(deposited.amount, 6)} vcUSDC deposited to the selected Safe.`,
      );
      setFundAmount("");
      await refreshConfiguration(configuration.safe, wallet.state.account!);
    } catch (cause) {
      const message = transactionErrorMessage(cause, "Safe deposit failed.");
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setStage(null);
    }
  }

  async function authorizeBalanceViewer() {
    if (!connected || !configuration) return;
    setRevealPending(true);
    try {
      await runAction(
        "REVEAL SAFE BALANCE",
        (onStage) => authorizeSafeBalanceViewer({
          configuration,
          provider: wallet.state.selectedProvider!.provider,
          account: wallet.state.account!,
          onStage,
        }),
        {
          refreshAfter: false,
          afterExecution: async (completed, onStage) => {
            onStage("Refreshing balance-view authorization");
            const refreshed = await waitForBalanceViewerConfiguration(
              completed.safe,
            );
            if (!refreshed?.confidentialViewerAuthorized) {
              throw new Error(
                "Balance-view authorization is still being indexed. Refresh and try again.",
              );
            }
            onStage("Confirm the private balance reveal in your wallet");
            const value = await revealSafeConfidentialBalance({
              configuration: refreshed,
              walletClient: wallet.state.walletClient!,
            });
            const handle = refreshed.balances.confidentialHandle;
            if (handle) setRevealedSafeBalance({ handle, value });
            return "Safe vcUSDC balance decrypted for this session.";
          },
        },
      );
    } finally {
      setRevealPending(false);
    }
  }

  async function waitForBalanceViewerConfiguration(safe: Address) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const refreshed = await refreshConfiguration(
        safe,
        wallet.state.account!,
      );
      if (refreshed?.confidentialViewerAuthorized) return refreshed;
      if (attempt < 3) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
    }
    return null;
  }

  async function revealBalance(
    targetConfiguration = configuration,
  ) {
    if (!connected || !targetConfiguration) return;
    const toastId = toasts.start(
      "REVEAL SAFE BALANCE",
      "Requesting private access for the current vcUSDC handle…",
    );
    setRevealPending(true);
    setError(null);
    try {
      const value = await revealSafeConfidentialBalance({
        configuration: targetConfiguration,
        walletClient: wallet.state.walletClient!,
      });
      const handle = targetConfiguration.balances.confidentialHandle;
      if (handle) setRevealedSafeBalance({ handle, value });
      toasts.succeed(toastId, "Safe vcUSDC balance decrypted for this session.");
    } catch (cause) {
      const message = transactionErrorMessage(cause, "Balance reveal failed.");
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setRevealPending(false);
    }
  }

  function toggleBalanceReveal() {
    if (!configuration) return;
    if (!configuration.confidentialViewerAuthorized) {
      void authorizeBalanceViewer();
    } else if (revealedSafeBalance === null) {
      void revealBalance();
    } else {
      setRevealedSafeBalance(null);
    }
  }

  async function requestUnwrap() {
    if (!connected || !configuration) return;
    const recipient = wallet.state.account!;
    let customAmount: bigint | null = null;
    const revealedBalance =
      revealedSafeBalance?.handle ===
      configuration.balances.confidentialHandle
        ? revealedSafeBalance.value
        : null;
    try {
      if (!unwrapFullBalance) {
        if (revealedBalance === null) {
          throw new Error("Reveal the current vcUSDC balance first.");
        }
        customAmount = parseUnits(unwrapAmount, 6);
        if (customAmount <= 0n) {
          throw new Error(
            "Enter a positive custom amount with at most 6 decimals.",
          );
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid unwrap input.");
      return;
    }
    setUnwrapRequest(null);
    setUnwrapRequestSafe(null);
    setUnwrapFinalization(null);
    const completed = await runAction(
      `UNWRAP ${unwrapFullBalance ? "FULL" : "CUSTOM"} SAFE vcUSDC`,
      (onStage) =>
        unwrapFullBalance
          ? unwrapFullSafeConfidentialBalance({
              configuration,
              recipient,
              provider: wallet.state.selectedProvider!.provider,
              account: wallet.state.account!,
              onStage,
            })
          : unwrapPartialSafeConfidentialBalance({
              configuration,
              recipient,
              amount: customAmount!,
              revealedBalance: revealedBalance!,
              walletClient: wallet.state.walletClient!,
              provider: wallet.state.selectedProvider!.provider,
              account: wallet.state.account!,
              onStage,
            }),
    );
    if (!completed?.executed || !completed.executionTransactionHash) return;
    try {
      const request = await findSafeUnwrapRequest(
        completed.executionTransactionHash,
      );
      setUnwrapRequest(request);
      setUnwrapRequestSafe(completed.safe);
      setUnwrapFinalization(null);
    } catch (cause) {
      setError(
        transactionErrorMessage(
          cause,
          "Could not recover the unwrap request.",
        ),
      );
    }
  }

  async function finalizeUnwrap() {
    if (!connected || !configuration || !unwrapRequest) return;
    const toastId = toasts.start(
      "FINALIZE UNWRAP",
      "Waiting for the public decryption proof…",
    );
    setError(null);
    try {
      const finalized = await finalizeSafeUnwrap({
        requestHandle: unwrapRequest.requestHandle,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setUnwrapStage(nextStage);
          toasts.update(toastId, nextStage);
        },
      });
      setUnwrapFinalization(finalized);
      toasts.succeed(
        toastId,
        `${formatUnits(finalized.plaintextAmount, 6)} vUSDC released.`,
      );
      await refreshConfiguration(configuration.safe, wallet.state.account!);
    } catch (cause) {
      const message = transactionErrorMessage(
        cause,
        "Unwrap finalization failed.",
      );
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setUnwrapStage(null);
    }
  }

  async function prepare() {
    if (!connected || !configuration) return;
    const missingFields = [
      !input.metadata.trim() ? "public metadata" : null,
      !input.ceiling.trim() ? "public ceiling" : null,
      !input.deadline.trim() ? "bid deadline" : null,
      vendorCount === 0 ? "at least one approved vendor" : null,
    ].filter((field): field is string => field !== null);
    setError(null);
    if (missingFields.length > 0) {
      setTenderValidationError(
        `Complete ${missingFields.join(", ")} before creating the tender.`,
      );
      return;
    }
    try {
      const terms = parseSafeTenderInput(input);
      assertSafeCeilingWithinRevealedBalance(
        terms.publicCeiling,
        currentRevealedBalance,
      );
    } catch (cause) {
      setTenderValidationError(
        cause instanceof Error ? cause.message : "Check the tender details and try again.",
      );
      return;
    }
    setTenderValidationError(null);
    await runAction(
      "CREATE SAFE TENDER",
      (onStage) => prepareSafeTender({
          input,
          configuration,
          walletClient: wallet.state.walletClient!,
          provider: wallet.state.selectedProvider!.provider,
          account: wallet.state.account!,
          onStage,
        }),
      {
        afterExecution: async (completed, onStage) => {
          if (!completed.executionTransactionHash) return null;
          onStage("Finding the created tender on Sepolia");
          const tenderId = await findCreatedTenderId(
            completed.executionTransactionHash,
          );
          onRefresh();
          const funding = await confirmCreatedTenderFunding({
            tenderId,
            triggerTransactionHash: completed.executionTransactionHash,
            walletClient: wallet.state.walletClient!,
            account: wallet.state.account!,
            onStage: (nextStage) => onStage(fundingStageLabel[nextStage]),
          });
          onRefresh();
          if (funding.status === "cancelled") {
            throw new Error(
              "The tender was cancelled because the Safe could not escrow the full public ceiling.",
            );
          }
          return `Tender ${tenderId.toString()} is Open and accepting bids.`;
        },
      },
    );
  }

  async function refreshProposal() {
    if (!result) return;
    const toastId = toasts.start("SAFE STATUS", "Reading threshold status…");
    try {
      const status = await getSafeProposalStatus(result.safeTxHash);
      setResult((current) => current ? { ...current, ...status } : current);
      toasts.succeed(toastId, `${status.confirmations}/${status.threshold} approvals collected.`);
    } catch {
      toasts.fail(toastId, "Safe Transaction Service status is unavailable.");
    }
  }

  async function approveProposal(
    safe = result?.safe,
    safeTxHash = result?.safeTxHash,
  ) {
    if (!safe || !safeTxHash || !connected) return;
    const toastId = toasts.startStack(
      "SAFE APPROVAL",
      "Checking proposal status…",
    );
    setStage("Checking proposal status");
    try {
      const status = await approveAndExecuteSafeProposal({
        safe,
        safeTxHash,
        provider: wallet.state.selectedProvider!.provider,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          setStage(nextStage);
          toasts.update(toastId, nextStage);
        },
      });
      if (result?.safeTxHash === safeTxHash) {
        setResult((current) => current ? { ...current, ...status } : current);
      }
      setStoredStatuses((current) => ({ ...current, [safeTxHash]: status }));
      const actionKind =
        result?.safeTxHash === safeTxHash
          ? result.kind
          : storedProposals.find(
              (proposal) => proposal.safeTxHash === safeTxHash,
            )?.kind;
      let successMessage = status.executed
        ? "Safe batch executed."
        : `${status.confirmations}/${status.threshold} approvals collected.`;
      if (
        status.executed &&
        status.executionTransactionHash &&
        actionKind === "tender"
      ) {
        setStage("Finding the created tender on Sepolia");
        toasts.update(toastId, "Finding the created tender on Sepolia");
        const tenderId = await findCreatedTenderId(
          status.executionTransactionHash,
        );
        onRefresh();
        const funding = await confirmCreatedTenderFunding({
          tenderId,
          triggerTransactionHash: status.executionTransactionHash,
          walletClient: wallet.state.walletClient!,
          account: wallet.state.account!,
          onStage: (nextStage) => {
            const nextLabel = fundingStageLabel[nextStage];
            setStage(nextLabel);
            toasts.update(toastId, nextLabel);
          },
        });
        onRefresh();
        if (funding.status === "cancelled") {
          throw new Error(
            "The tender was cancelled because the Safe could not escrow the full public ceiling.",
          );
        }
        successMessage = `Tender ${tenderId.toString()} is Open and accepting bids.`;
      }
      if (
        status.executed &&
        status.executionTransactionHash &&
        actionKind === "unwrap"
      ) {
        try {
          const request = await findSafeUnwrapRequest(
            status.executionTransactionHash,
          );
          setUnwrapRequest(request);
          setUnwrapRequestSafe(safe);
          setUnwrapFinalization(null);
        } catch {
          setError(
            "Safe executed the unwrap, but its request is still being indexed.",
          );
        }
      }
      let refreshedConfiguration: SafeAccountConfiguration | null = null;
      if (status.executed && wallet.state.account) {
        refreshedConfiguration = await refreshConfiguration(
          safe,
          wallet.state.account,
        );
      }
      if (
        status.executed &&
        actionKind === "view-balance" &&
        !refreshedConfiguration?.confidentialViewerAuthorized
      ) {
        refreshedConfiguration = await waitForBalanceViewerConfiguration(safe);
      }
      if (
        status.executed &&
        actionKind === "view-balance" &&
        refreshedConfiguration?.confidentialViewerAuthorized
      ) {
        setRevealPending(true);
        const nextLabel = "Confirm the private balance reveal in your wallet";
        setStage(nextLabel);
        toasts.update(toastId, nextLabel);
        const value = await revealSafeConfidentialBalance({
          configuration: refreshedConfiguration,
          walletClient: wallet.state.walletClient!,
        });
        const handle = refreshedConfiguration.balances.confidentialHandle;
        if (handle) setRevealedSafeBalance({ handle, value });
        successMessage = "Safe vcUSDC balance decrypted for this session.";
      } else if (status.executed && actionKind === "view-balance") {
        throw new Error(
          "Balance-view authorization is still being indexed. Refresh and try again.",
        );
      }
      toasts.succeed(toastId, successMessage);
    } catch (cause) {
      const message = transactionErrorMessage(cause, "Safe approval failed.");
      setError(message);
      toasts.fail(toastId, message);
    } finally {
      setRevealPending(false);
      setStage(null);
    }
  }

  async function refreshStored(proposal: StoredSafeProposal) {
    try {
      const status = await getSafeProposalStatus(proposal.safeTxHash);
      setStoredStatuses((current) => ({
        ...current,
        [proposal.safeTxHash]: status,
      }));
    } catch {
      setError("Could not recover that proposal from Safe Transaction Service.");
    }
  }

  const pendingProposals = storedProposals.filter((proposal) => {
    const status = storedStatuses[proposal.safeTxHash];
    return (
      status &&
      !status.executed &&
      proposal.safeTxHash !== result?.safeTxHash
    );
  });
  const historicalProposals = storedProposals.filter((proposal) => {
    const status = storedStatuses[proposal.safeTxHash];
    return !status || status.executed;
  });
  const balanceResult =
    result?.kind === "view-balance" ? result : null;
  const preparationResult =
    result?.kind === "setup" ? result : null;
  const tenderResult = result?.kind === "tender" ? result : null;
  const unwrapResult = result?.kind === "unwrap" ? result : null;
  const currentRevealedBalance =
    revealedSafeBalance &&
    configuration &&
    revealedSafeBalance.handle ===
      configuration.balances.confidentialHandle
      ? revealedSafeBalance.value
      : null;
  const ceilingExceedsBalance = (() => {
    if (currentRevealedBalance === null || !input.ceiling.trim()) return false;
    try {
      return parseUnits(input.ceiling.trim(), 6) > currentRevealedBalance;
    } catch {
      return false;
    }
  })();
  const currentUnwrapRequest =
    unwrapRequestSafe &&
    configuration &&
    unwrapRequestSafe.toLowerCase() === configuration.safe.toLowerCase()
      ? unwrapRequest
      : null;
  const vendorRows = input.vendors === ""
    ? [""]
    : input.vendors.split("\n").slice(0, 8);
  const vendorCount = vendorRows.filter((vendor) => vendor.trim()).length;

  function updateVendor(index: number, value: string) {
    setTenderValidationError(null);
    const pasted = value.split(/[\s,]+/).filter(Boolean);
    const next = [...vendorRows];
    if (pasted.length > 1) {
      next.splice(index, 1, ...pasted.slice(0, 8 - index));
    } else {
      next[index] = value;
    }
    setInput((current) => ({
      ...current,
      vendors: next.slice(0, 8).join("\n"),
    }));
  }

  function removeVendor(index: number) {
    setTenderValidationError(null);
    const next = vendorRows.filter((_, itemIndex) => itemIndex !== index);
    setInput((current) => ({
      ...current,
      vendors: (next.length > 0 ? next : [""]).join("\n"),
    }));
  }

  function addVendor() {
    if (vendorRows.length >= 8) return;
    setTenderValidationError(null);
    setInput((current) => ({
      ...current,
      vendors: [...vendorRows, ""].join("\n"),
    }));
  }

  return (
    <main className="role-workspace safe-workspace" id="main-content">
      <section className="workspace-intro">
        <ContextHelp
          label="Help for Safe Buyer workspace"
          title="HOW TO USE SAFE BUYER"
          steps={[
            "Connect any owner of a deployed Sepolia Safe.",
            "Choose the discovered Safe, or paste its address.",
            "Deposit vcUSDC from the connected wallet when the Safe needs funds.",
            "Run the one-time FlareQuorum setup from the tender form if required.",
            "Reveal the current Safe balance and keep the public ceiling within it.",
            "Approve the atomic creation batch, then confirm the funding proof to open bidding.",
          ]}
          note="Depositing signs with the connected wallet. Setup, tender creation, balance-view authorization, and unwrap remain normal Safe proposals that preserve the configured threshold."
        />
        <p className="eyebrow">SAFE BUYER / PRIMARY WORKFLOW</p>
        <h1>Use your own Safe treasury.</h1>
        <p>
          FlareQuorum discovers Safe accounts owned by the connected wallet,
          configures a dedicated preparation module, and preserves the Safe
          threshold for every treasury action.
        </p>
      </section>
      <WalletPanel wallet={wallet} />

      {connected && (
        <section className="write-form safe-selector">
          <div className="form-heading">
            <p className="eyebrow">1 / SELECT TREASURY</p>
            <h2>Choose a Sepolia Safe</h2>
            <p>
              Select a card to inspect its live configuration. FlareQuorum does not
              open or read full Safe details until you choose one.
            </p>
            <ContextHelp
              compact
              label="Help for Safe selection"
              title="HOW TO SELECT A SAFE"
              steps={[
                "Choose a discovered Safe owned by the connected wallet.",
                "Use CHECK SAFE only for an address that is not listed; ownership is verified on-chain.",
                "After selection, the live Safe funds and FlareQuorum readiness cards appear below.",
              ]}
            />
          </div>
          {ownerSafes.length > 0 && (
            <div className="safe-choice-list" aria-label="Owned Safe treasuries">
              {ownerSafes.map((safe, index) => {
                const cacheKey = safe.toLowerCase();
                const cached = configurationCache[cacheKey];
                const selected =
                  selectedSafe?.toLowerCase() === cacheKey;
                const loading = loadingSafe?.toLowerCase() === cacheKey;
                const lastUsed =
                  lastUsedSafe?.toLowerCase() === cacheKey;
                const demo =
                  safeReleaseConfiguration.safe.toLowerCase() === cacheKey;
                return (
                  <button
                    className={[
                      "safe-treasury-option",
                      selected ? "selected" : "",
                      loading ? "loading" : "",
                    ].filter(Boolean).join(" ")}
                    type="button"
                    key={safe}
                    aria-pressed={selected}
                    onClick={() =>
                      void refreshConfiguration(safe, wallet.state.account!)
                    }
                  >
                    <span className="safe-option-heading">
                      <span>
                        {demo ? "FLAREQUORUM DEMO SAFE" : `SAFE TREASURY ${index + 1}`}
                      </span>
                      <span className="safe-option-badges">
                        {lastUsed && (
                          <span className="safe-option-badge">LAST USED</span>
                        )}
                        {cached && (
                          <span
                            className="safe-option-badge"
                            data-ready={cached.ready}
                          >
                            {cached.ready ? "READY" : "SETUP REQUIRED"}
                          </span>
                        )}
                        {loading && (
                          <span className="safe-option-badge">READING…</span>
                        )}
                      </span>
                    </span>
                    <strong>{shortAddress(safe)}</strong>
                    <small>
                      {cached
                        ? `${cached.owners.length} owner(s) · threshold ${cached.threshold}`
                        : "Select to inspect live Sepolia status"}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          {!discoveryStage && ownerSafes.length === 0 && (
            <p className="safe-empty-list">
              No owned Safe was discovered. You can check a Safe address
              manually or create a personal Safe below.
            </p>
          )}
          <div className="safe-manual-entry">
            <div>
              <strong>USE A SAFE NOT LISTED</strong>
              <span>
                Enter its Sepolia address. Ownership is verified on-chain before
                FlareQuorum displays the details.
              </span>
            </div>
            <label>
              <span>Safe address</span>
              <input
                value={safeInput}
                onChange={(event) => setSafeInput(event.target.value)}
                placeholder="0x…"
              />
            </label>
            <button
              className="secondary-button"
              disabled={discoveryStage !== null || loadingSafe !== null}
              onClick={() => void selectSafe()}
            >
              CHECK SAFE →
            </button>
          </div>
          <div className="safe-create-option">
            <div>
              <strong>NO SAFE YET?</strong>
              <span>
                Deploy a personal Safe 1/1 owned by this wallet. FlareQuorum setup
                remains a separate Safe proposal.
              </span>
            </div>
            <button
              className="primary-button"
              disabled={discoveryStage !== null}
              onClick={() => void createSafe()}
            >
              CREATE MY SAFE 1/1 →
            </button>
          </div>
          {discoveryStage && (
            <p className="progress-line" aria-live="polite">{discoveryStage}</p>
          )}
        </section>
      )}

      {selectedSafe && loadingSafe && !configuration && (
        <SafeConfigurationSkeleton safe={selectedSafe} />
      )}
      {safeReadWarning && (
        <p className="safe-read-warning" role="status">
          {safeReadWarning}
        </p>
      )}
      {connected && !selectedSafe && !discoveryStage && (
        <section className="safe-selection-empty" aria-label="No Safe selected">
          <span aria-hidden="true">01</span>
          <div>
            <strong>SELECT A SAFE TO CONTINUE</strong>
            <span>
              Safe authority, confidential vcUSDC, and FlareQuorum readiness will
              appear here after your selection.
            </span>
          </div>
        </section>
      )}

      {configuration && (
        <>
          {loadingSafe && (
            <p className="safe-refreshing" aria-live="polite">
              Refreshing selected Safe from Sepolia…
            </p>
          )}
          <SafeConfigurationCard
            configuration={configuration}
            revealedConfidentialBalance={
              revealedSafeBalance?.handle ===
              configuration.balances.confidentialHandle
                ? revealedSafeBalance.value
                : null
            }
            busy={
              loadingSafe !== null ||
              stage !== null ||
              unwrapStage !== null
            }
            revealPending={revealPending}
            onRefresh={() =>
              void refreshConfiguration(
                configuration.safe,
                wallet.state.account!,
              )
            }
            onToggleReveal={toggleBalanceReveal}
            depositControl={
              <SafeDepositControl
                amount={fundAmount}
                busy={stage !== null}
                onAmountChange={setFundAmount}
                onFund={() => void fund()}
              />
            }
            unwrapControl={
              <SafeUnwrapControl
                configuration={configuration}
                fullBalance={unwrapFullBalance}
                amount={unwrapAmount}
                recipient={wallet.state.account!}
                revealedBalance={currentRevealedBalance}
                request={currentUnwrapRequest}
                finalization={unwrapFinalization}
                busy={stage !== null || unwrapStage !== null}
                finalizing={unwrapStage !== null}
                onFullBalance={() => {
                  setUnwrapFullBalance((current) => !current);
                  setError(null);
                }}
                onAmountChange={(amount) => {
                  setUnwrapFullBalance(false);
                  setUnwrapAmount(amount);
                }}
                onReveal={toggleBalanceReveal}
                onRequest={() => void requestUnwrap()}
                onFinalize={() => void finalizeUnwrap()}
              />
            }
          />
          {stage && (
            <p className="progress-line safe-action-feedback" aria-live="polite">
              {stage}
            </p>
          )}
          {error && (
            <p className="inline-error safe-action-feedback" role="alert">
              {error}
            </p>
          )}
          {balanceResult && (
            <SafeActionHandoff
              result={balanceResult}
              busy={stage !== null}
              onRefresh={() => void refreshProposal()}
              onApprove={() => void approveProposal()}
            />
          )}
          {unwrapResult && (
            <SafeActionHandoff
              result={unwrapResult}
              busy={stage !== null}
              onRefresh={() => void refreshProposal()}
              onApprove={() => void approveProposal()}
            />
          )}
          <section className="write-form safe-tender-form">
            <header className="safe-tender-form-header">
              <div className="form-heading">
                <p className="eyebrow">2 / CREATE TENDER</p>
                <h2>Create a Safe-owned tender</h2>
                <p>
                  Define the public terms and approve one confidential funding
                  batch through this Safe.
                </p>
                <ContextHelp
                  compact
                  label="Help for Safe tender creation"
                  title="HOW TO CREATE A SAFE TENDER"
                  steps={[
                    "Confirm setup is READY, reveal the Safe balance, and keep the public ceiling within it.",
                    "Enter public terms and approved vendor addresses.",
                    "Create the Safe proposal, approve/execute it, then confirm exact funding to open bidding.",
                  ]}
                  note="Tender creation uses Safe threshold approval plus a public funding confirmation transaction."
                />
              </div>
              <div className="safe-tender-context">
                <span>SELECTED SAFE</span>
                <strong>{shortAddress(configuration.safe)}</strong>
                <small>
                  {configuration.owners.length} owner(s) · threshold {configuration.threshold}
                </small>
              </div>
            </header>
            <SafeTenderSetup
              configuration={configuration}
              busy={stage !== null}
              onSetup={() => void setup()}
            />
            {preparationResult && (
              <SafeActionHandoff
                result={preparationResult}
                busy={stage !== null}
                onRefresh={() => void refreshProposal()}
                onApprove={() => void approveProposal()}
              />
            )}
            <div className="safe-tender-form-body">
              <section className="safe-tender-terms">
                <div className="safe-tender-section-heading">
                  <span>01</span>
                  <div className="safe-tender-terms-heading">
                    <div>
                      <strong>TENDER TERMS</strong>
                      <small>Public procurement rules</small>
                    </div>
                    <div
                      className="safe-tender-balance-inline"
                      data-ready={currentRevealedBalance !== null}
                    >
                      <span>
                        <small>vcUSDC</small>
                        <strong>
                          {currentRevealedBalance !== null
                            ? formatUnits(currentRevealedBalance, 6)
                            : configuration.balances.confidential === "encrypted"
                              ? "••••••"
                              : "0"}
                        </strong>
                      </span>
                      <button
                        className="balance-reveal safe-balance-eye"
                        type="button"
                        disabled={
                          configuration.balances.confidential !== "encrypted" ||
                          stage !== null ||
                          revealPending
                        }
                        onClick={toggleBalanceReveal}
                        aria-label={
                          currentRevealedBalance !== null
                            ? "Hide Safe vcUSDC balance"
                            : "Reveal Safe vcUSDC balance"
                        }
                        title={
                          currentRevealedBalance !== null
                            ? "Hide vcUSDC"
                            : "Reveal vcUSDC to validate the ceiling"
                        }
                      >
                        {currentRevealedBalance !== null ? (
                          <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                            <path d="m4 4 16 16" />
                            <path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.9M14.4 17.7A10 10 0 0 1 12 18c-6 0-9.5-6-9.5-6a17 17 0 0 1 3.1-3.7" />
                          </svg>
                        ) : (
                          <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <label className="safe-tender-metadata">
                  <span>Public metadata</span>
                  <input
                    value={input.metadata}
                    onChange={(event) => {
                      setTenderValidationError(null);
                      setInput((current) => ({
                        ...current,
                        metadata: event.target.value,
                      }));
                    }}
                    placeholder="Procurement title or terms fingerprint source"
                    aria-invalid={Boolean(
                      tenderValidationError && !input.metadata.trim(),
                    )}
                  />
                </label>
                <label>
                  <span>Public ceiling (vUSDC)</span>
                  <input
                    value={input.ceiling}
                    onChange={(event) => {
                      setTenderValidationError(null);
                      setInput((current) => ({
                        ...current,
                        ceiling: event.target.value,
                      }));
                    }}
                    inputMode="decimal"
                    placeholder="100"
                    aria-invalid={Boolean(
                      ceilingExceedsBalance ||
                        (tenderValidationError && !input.ceiling.trim()),
                    )}
                  />
                </label>
                {ceilingExceedsBalance && (
                  <p className="inline-error safe-ceiling-error" role="alert">
                    Public ceiling exceeds the available Safe vcUSDC balance.
                  </p>
                )}
                <label>
                  <span>Bid deadline</span>
                  <input
                    type="datetime-local"
                    value={input.deadline}
                    min={minimumSafeDeadline()}
                    onChange={(event) => {
                      setTenderValidationError(null);
                      setInput((current) => ({
                        ...current,
                        deadline: event.target.value,
                      }));
                    }}
                    aria-invalid={Boolean(
                      tenderValidationError && !input.deadline.trim(),
                    )}
                  />
                  <small className="field-hint">
                    Local machine time; choose at least five minutes from now
                    so Safe funding proof and vendor signing have time to complete.
                  </small>
                </label>
              </section>

              <fieldset className="safe-tender-vendors">
                <legend>
                  <span className="safe-tender-section-heading">
                    <span>02</span>
                    <span>
                      <strong>APPROVED VENDORS</strong>
                      <small>One immutable bid slot per address</small>
                    </span>
                  </span>
                  <span className="safe-vendor-count">{vendorCount} / 8</span>
                </legend>
                <div className="safe-vendor-list">
                  {vendorRows.map((vendor, index) => (
                    <div className="safe-vendor-row" key={`safe-vendor-${index}`}>
                      <label htmlFor={`safe-approved-vendor-${index}`}>
                        <span>Vendor {index + 1}</span>
                        <input
                          id={`safe-approved-vendor-${index}`}
                          value={vendor}
                          onChange={(event) => updateVendor(index, event.target.value)}
                          placeholder="0x…"
                          aria-invalid={Boolean(
                            tenderValidationError && vendorCount === 0,
                          )}
                        />
                      </label>
                      {vendorRows.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove Safe vendor ${index + 1}`}
                          onClick={() => removeVendor(index)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="safe-vendor-add"
                  type="button"
                  disabled={vendorRows.length >= 8}
                  onClick={addVendor}
                >
                  + ADD VENDOR
                </button>
              </fieldset>
            </div>

            {tenderValidationError && (
              <div className="safe-tender-validation" role="alert">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>CHECK TENDER DETAILS</strong>
                  <p>{tenderValidationError}</p>
                </div>
              </div>
            )}

            <footer className="safe-tender-submit">
              <div>
                <p className="eyebrow">03 / REVIEW &amp; SUBMIT</p>
                <dl>
                  <div>
                    <dt>SAFE THRESHOLD</dt>
                    <dd>{configuration.threshold} of {configuration.owners.length}</dd>
                  </div>
                  <div>
                    <dt>REVIEW WALLET</dt>
                    <dd>{shortAddress(wallet.state.account!)}</dd>
                  </div>
                </dl>
                <small>
                  The review wallet receives private bid access only after
                  proof-derived finalization. The relay cannot spend this Safe.
                </small>
              </div>
              <button
                className="primary-button"
                disabled={
                  !configuration.ready ||
                  stage !== null ||
                  currentRevealedBalance === null ||
                  ceilingExceedsBalance
                }
                onClick={() => void prepare()}
              >
                CREATE WITH SAFE →
              </button>
            </footer>
            {tenderResult && (
              <SafeActionHandoff
                result={tenderResult}
                busy={stage !== null}
                onRefresh={() => void refreshProposal()}
                onApprove={() => void approveProposal()}
              />
            )}
          </section>

          {pendingProposals.length > 0 && (
            <section className="write-form safe-recovery">
              <div className="form-heading">
                <p className="eyebrow">PENDING APPROVALS</p>
                <h2>Safe transactions waiting for signatures</h2>
                <p>
                  Status refreshes automatically. Execution remains impossible
                  until the Safe threshold is reached.
                </p>
              </div>
              <ul>
                {pendingProposals.map((proposal) => {
                  const status = storedStatuses[proposal.safeTxHash];
                  return (
                    <li key={proposal.safeTxHash}>
                      <div>
                        <strong>{safeActionLabel(proposal.kind)}</strong>
                        <span>{shortHash(proposal.safeTxHash)}</span>
                        <small>{new Date(proposal.createdAt).toLocaleString()}</small>
                        <small>
                          {status.confirmations}/{status.threshold} approvals
                        </small>
                      </div>
                      <div className="safe-handoff-actions">
                        <button
                          className="primary-button"
                          disabled={stage !== null}
                          onClick={() =>
                            void approveProposal(
                              proposal.safe,
                              proposal.safeTxHash,
                            )
                          }
                        >
                          APPROVE / EXECUTE
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {historicalProposals.length > 0 && (
            <details className="safe-history">
              <summary>
                <span>
                  <span className="eyebrow">TRANSACTION HISTORY</span>
                  <strong>
                    {historicalProposals.length} recent Safe action(s)
                  </strong>
                </span>
                <span aria-hidden="true">+</span>
              </summary>
              <div>
                <p>
                  Public action type, Safe transaction hash, timestamp, and
                  execution status are stored in this browser.
                </p>
                <ul>
                  {historicalProposals.map((proposal) => {
                    const status = storedStatuses[proposal.safeTxHash];
                    return (
                      <li key={proposal.safeTxHash}>
                        <div>
                          <strong>{safeActionLabel(proposal.kind)}</strong>
                          <span>{shortHash(proposal.safeTxHash)}</span>
                          <small>
                            {new Date(proposal.createdAt).toLocaleString()}
                          </small>
                          <small>
                            {status?.executed
                              ? "Executed"
                              : "Checking Safe Transaction Service…"}
                          </small>
                        </div>
                        <div className="safe-handoff-actions">
                          {!status && (
                            <button
                              className="secondary-button"
                              onClick={() => void refreshStored(proposal)}
                            >
                              CHECK NOW
                            </button>
                          )}
                          {status?.executionTransactionHash && (
                            <a
                              className="secondary-button"
                              href={`https://sepolia.etherscan.io/tx/${status.executionTransactionHash}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ETHERSCAN ↗
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          )}
        </>
      )}
      {!configuration && error && (
        <p className="inline-error" role="alert">{error}</p>
      )}
    </main>
  );
}
