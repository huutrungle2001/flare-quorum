import type { EIP1193Provider } from "viem";

export interface WalletProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface WalletProviderDetail {
  info: WalletProviderInfo;
  provider: EIP1193Provider;
}

interface AnnounceProviderEvent extends Event {
  detail: WalletProviderDetail;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const selectedProviderStorageKey = "flarequorum:selected-provider-rdns";

export function subscribeToWalletProviders(
  onProvider: (detail: WalletProviderDetail) => void,
) {
  const seen = new Set<string>();
  const announce = (event: Event) => {
    const detail = (event as AnnounceProviderEvent).detail;
    if (
      !detail?.provider ||
      !detail.info?.uuid ||
      !detail.info?.rdns ||
      seen.has(detail.info.uuid)
    ) {
      return;
    }
    seen.add(detail.info.uuid);
    onProvider(detail);
  };

  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  if (window.ethereum) {
    onProvider({
      info: {
        uuid: "legacy-injected",
        name: "Injected wallet",
        icon: "",
        rdns: "legacy.injected",
      },
      provider: window.ethereum,
    });
  }

  return () => window.removeEventListener("eip6963:announceProvider", announce);
}
