import type { ComponentType } from "react";
import "../src/shell/styles.css";

export default function VeilBidSite({
  Component,
  pageProps,
}: {
  Component: ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}) {
  return <Component {...pageProps} />;
}
