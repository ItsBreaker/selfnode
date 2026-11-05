import { formatAmount } from "@selfnode/core";
import { cx } from "./cx";

/** Exact amount in tabular mono; fraction digits quieter; full value on hover. */
export function Amount({
  value,
  decimals,
  symbol,
  maxFraction = 6,
  size = "body",
}: {
  value: bigint;
  decimals: number;
  symbol: string;
  maxFraction?: number;
  size?: "body" | "lead" | "h1";
}) {
  const f = formatAmount(value, decimals, maxFraction);
  // Non-zero but below display precision: say so instead of showing "0…".
  const tiny = f.whole === "0" && f.fraction === "" && f.truncated;
  return (
    <span
      className={cx(
        "font-mono tabular whitespace-nowrap",
        size === "h1" ? "text-h1 tracking-tight" : size === "lead" ? "text-lead" : "text-body",
      )}
      title={`${f.exact} ${symbol}`}
    >
      {tiny ? (
        <span className="text-text">&lt; 0.{"0".repeat(Math.max(0, maxFraction - 1))}1</span>
      ) : (
        <>
          <span className="text-text">{f.whole}</span>
          {f.fraction && <span className="text-muted">.{f.fraction}</span>}
          {f.truncated && <span className="text-muted">…</span>}
        </>
      )}
      <span
        className={cx(
          "ml-1.5 font-sans font-medium text-muted",
          size === "h1" ? "text-h3" : "text-small",
        )}
      >
        {symbol}
      </span>
    </span>
  );
}
