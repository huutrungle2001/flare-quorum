import { useEffect, useState } from "react";

function truncatePublicValue(value: string) {
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function PublicValue({
  value,
  label,
  href,
}: {
  value: string;
  label: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const visibleValue = truncatePublicValue(value);

  return (
    <span className="public-value">
      {href ? (
        <a className="text-link public-value-text" href={href} target="_blank" rel="noreferrer">
          {visibleValue} ↗
        </a>
      ) : (
        <code className="public-value-text">{visibleValue}</code>
      )}
      <button className="public-value-copy" type="button" onClick={() => void copyValue()} aria-label={`Copy ${label}`}>
        {copied ? "COPIED" : "COPY"}
      </button>
      <span className="visually-hidden" aria-live="polite">{copied ? `${label} copied` : ""}</span>
    </span>
  );
}
