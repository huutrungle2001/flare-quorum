import type { PublicTender } from "@veilbid/chain-bindings";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import {
  readVendorAdmission,
  submitVendorBid,
  type VendorBidStage,
} from "../transactions/vendorBid";
import type { WalletController } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";
import {
  formatLocalDeadline,
  formatUtcDeadline,
  isTenderAcceptingBids,
  remainingTimeLabel,
} from "../time/tenderTime";
import { transactionErrorMessage } from "../transactions/errors";
import { ContextHelp } from "../shell/ContextHelp";

const stageLabels: Record<VendorBidStage, string> = {
  checking: "Checking admission",
  encrypting: "Encrypting for market",
  simulating: "Simulating transaction",
  signing: "Awaiting signature",
  confirming: "Waiting for confirmation",
  confirmed: "Bid confirmed",
};

export function VendorBidForm({
  wallet,
  tenders,
  onConfirmed,
  readAdmission = readVendorAdmission,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  onConfirmed: () => void;
  readAdmission?: typeof readVendorAdmission;
}) {
  const toasts = useToasts();
  const [nowMilliseconds, setNowMilliseconds] = useState(() => Date.now());
  const openTenders = useMemo(
    () => tenders.filter((tender) =>
      isTenderAcceptingBids(tender, nowMilliseconds),
    ),
    [nowMilliseconds, tenders],
  );
  const openTenderIds = openTenders
    .map((tender) => tender.tenderId.toString())
    .join(",");
  const [admission, setAdmission] = useState<
    Record<string, { approved: boolean; submitted: boolean }>
  >({});
  const [admissionLoading, setAdmissionLoading] = useState(false);
  const [tenderId, setTenderId] = useState("");
  const [price, setPrice] = useState("");
  const [stage, setStage] = useState<VendorBidStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hex | null>(null);
  const connected =
    wallet.state.status === "connected" &&
    wallet.state.account &&
    wallet.state.walletClient;
  const eligibleTenders = useMemo(() => {
    if (!connected) return openTenders;
    if (admissionLoading) return [];
    return openTenders.filter((tender) => {
      const result = admission[tender.tenderId.toString()];
      return result?.approved && !result.submitted;
    });
  }, [admission, admissionLoading, connected, openTenders]);
  const selected = eligibleTenders.find(
    (tender) => tender.tenderId.toString() === tenderId,
  );
  const pending = stage !== null && stage !== "confirmed";

  useEffect(() => {
    setPrice("");
    setStage(null);
    setError(null);
    setTransactionHash(null);
  }, [wallet.state.sessionRevision]);

  useEffect(() => {
    let active = true;
    if (!connected || !wallet.state.account || openTenders.length === 0) {
      setAdmission({});
      setAdmissionLoading(false);
      return () => {
        active = false;
      };
    }
    setAdmissionLoading(true);
    void Promise.all(
      openTenders.map(async (tender) => [
        tender.tenderId.toString(),
        await readAdmission({
          tenderId: tender.tenderId,
          account: wallet.state.account!,
        }),
      ] as const),
    )
      .then((entries) => {
        if (active) setAdmission(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setAdmission({});
      })
      .finally(() => {
        if (active) setAdmissionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connected, openTenderIds, readAdmission, wallet.state.account]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMilliseconds(Date.now()),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      tenderId &&
      !eligibleTenders.some((tender) => tender.tenderId.toString() === tenderId)
    ) {
      setTenderId("");
      setError("The selected tender is no longer available for this wallet.");
    }
  }, [eligibleTenders, tenderId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!connected || !selected) return;
    const toastId = toasts.start(
      "SUBMIT BID",
      "Checking tender and vendor admission…",
    );
    setError(null);
    setTransactionHash(null);
    try {
      const result = await submitVendorBid({
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        tenderId: selected.tenderId,
        publicCeiling: selected.publicCeiling,
        bidDeadline: selected.bidDeadline,
        priceInput: price,
        onStage: (nextStage) => {
          setStage(nextStage);
          if (nextStage === "confirmed") {
            toasts.succeed(toastId, stageLabels[nextStage]);
          } else {
            toasts.update(toastId, stageLabels[nextStage]);
          }
        },
      });
      setTransactionHash(result.transactionHash);
      setPrice("");
      setAdmission((current) => ({
        ...current,
        [selected.tenderId.toString()]: {
          approved: true,
          submitted: true,
        },
      }));
      onConfirmed();
    } catch (cause) {
      setStage(null);
      toasts.fail(
        toastId,
        "Bid submission stopped. Review the wallet request and tender state.",
      );
      setError(
        transactionErrorMessage(
          cause,
          "Bid submission failed before confirmation. No transaction was sent.",
        ),
      );
    }
  }

  return (
    <form className="write-form" onSubmit={(event) => void submit(event)}>
      <div className="form-heading">
        <p className="eyebrow">SEALED BID</p>
        <h2>Encrypt and submit one immutable price.</h2>
        <ContextHelp
          compact
          label="Help for sealed bid submission"
          title="HOW TO SUBMIT A SEALED BID"
          steps={[
            "Choose an Open, unexpired tender approved for this wallet.",
            "Enter the private price; it is encrypted in this browser session.",
            "Simulate and sign one bid transaction. The contract prevents duplicates and late bids.",
          ]}
        />
      </div>
      <label>
        Active tender
        <select
          value={tenderId}
          onChange={(event) => setTenderId(event.target.value)}
          disabled={pending}
          required
        >
          <option value="">
            {openTenders.length === 0
              ? "No active tenders available"
              : admissionLoading
                ? "Checking vendor admission…"
                : "Select approved tender"}
          </option>
          {eligibleTenders.map((tender) => (
            <option
              key={tender.tenderId.toString()}
              value={tender.tenderId.toString()}
            >
              Tender {tender.tenderId.toString()} · ceiling{" "}
              {Number(tender.publicCeiling) / 1_000_000} vUSDC ·{" "}
              {remainingTimeLabel(tender.bidDeadline, nowMilliseconds)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="vendor-deadline-summary" aria-live="polite">
          <span>
            <strong>{remainingTimeLabel(selected.bidDeadline, nowMilliseconds)}</strong>
            {formatLocalDeadline(selected.bidDeadline)}
          </span>
          <small>On-chain: {formatUtcDeadline(selected.bidDeadline)} UTC</small>
        </div>
      )}
      {openTenders.length === 0 && (
        <p className="form-empty-hint" role="status">
          No confirmed, unexpired tender is accepting bids. Check Public and
          refresh after the buyer opens a tender.
        </p>
      )}
      {openTenders.length > 0 && !admissionLoading && eligibleTenders.length === 0 && (
        <p className="form-empty-hint" role="status">
          No active tender is approved for this wallet, or this wallet already
          submitted its one immutable bid.
        </p>
      )}
      <label>
        Private bid price (vUSDC)
        <input
          type="password"
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={pending}
          placeholder="Visible only in this browser session"
          required
        />
      </label>
      <div className="privacy-confirmation">
        <strong>Privacy boundary</strong>
        <span>
          The plaintext price is sent to the Nox handle client in memory. It is
          never written to the public index, URL, storage, or VeilBid logs.
        </span>
      </div>
      {stage && (
        <p className="progress-line" aria-live="polite">
          <span className="signal-dot" aria-hidden="true" />
          {stageLabels[stage]}
        </p>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {transactionHash && (
        <p className="result-line" aria-live="polite">
          Confirmed · {transactionHash.slice(0, 10)}…{transactionHash.slice(-8)}
        </p>
      )}
      <button
        className="primary-button"
        type="submit"
        disabled={!connected || !selected || pending || admissionLoading}
      >
        {connected ? "ENCRYPT, SIMULATE & SUBMIT →" : "CONNECT WALLET TO BID"}
      </button>
    </form>
  );
}
