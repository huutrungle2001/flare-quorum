import type { useWallet, WalletNetwork } from "./useWallet";

export type WalletController = ReturnType<typeof useWallet>;

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function WalletPanel({
  wallet,
  network = "sepolia",
}: {
  wallet: WalletController;
  network?: WalletNetwork;
}) {
  const { state } = wallet;
  const coston2 = network === "coston2";
  const networkLabel = coston2 ? "Flare Coston2" : "Ethereum Sepolia";

  if (state.status === "connected" && state.account) {
    return (
      <section className="wallet-panel connected" aria-label="Connected wallet">
        <div>
          <span className="signal-dot" aria-hidden="true" />
          <div>
            <strong>{shortAddress(state.account)}</strong>
          <span>{networkLabel} · signing enabled</span>
          </div>
        </div>
        <button className="secondary-button" onClick={wallet.disconnect}>
          DISCONNECT
        </button>
      </section>
    );
  }

  if (state.status === "wrong-chain") {
    return (
      <section className="wallet-panel warning" role="alert">
        <div>
          <span aria-hidden="true">!</span>
          <div>
            <strong>{coston2 ? "Coston2 confirmation needed" : "Sepolia confirmation needed"}</strong>
            <span>The automatic switch did not complete. Confirm the next wallet request.</span>
          </div>
        </div>
        <button
          className="secondary-button"
          onClick={coston2 ? wallet.switchToCoston2 : wallet.switchToSepolia}
        >
          RETRY {coston2 ? "COSTON2" : "SEPOLIA"} CONNECTION →
        </button>
      </section>
    );
  }

  return (
    <section className="wallet-connect" aria-label="Wallet providers">
      <div>
        <p className="eyebrow">EXPLICIT WALLET SELECTION</p>
        <h2>Connect only when you are ready to sign.</h2>
        <p>
          Choose a provider once; VeilBid connects it and requests {networkLabel}{" "}
          automatically when needed. Private keys never leave the wallet.
        </p>
        {state.error && <p className="inline-error" role="alert">{state.error}</p>}
      </div>
      <div className="provider-list">
        {state.providers.length === 0 ? (
          <p>No EIP-6963 wallet provider detected.</p>
        ) : (
          state.providers.map((provider) => (
            <button
              className="provider-button"
              key={provider.info.uuid}
              onClick={() => void wallet.connect(provider)}
              disabled={state.status === "connecting"}
            >
              <span>{provider.info.name}</span>
              <span aria-hidden="true">→</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
