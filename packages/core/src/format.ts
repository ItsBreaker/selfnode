import { formatUnits, getAddress, isAddress } from "viem";

/** 0x1234…abcd, checksummed. Hashes too (shorten(hash, 6)). */
export function shortHex(value: string, chars = 4): string {
  const v = isAddress(value, { strict: false }) ? getAddress(value) : value;
  if (v.length <= 2 + chars * 2 + 1) return v;
  return `${v.slice(0, 2 + chars)}…${v.slice(-chars)}`;
}

export interface FormattedAmount {
  /** Grouped integer part, e.g. "1,234". */
  whole: string;
  /** Fraction digits shown (may be ""), e.g. "5000". */
  fraction: string;
  /** True when digits were cut off (value has more precision than shown). */
  truncated: boolean;
  /** Full, exact decimal string for titles/copy. */
  exact: string;
}

/**
 * Exact, locale-independent amount formatting from base units. Never goes via
 * floating point. Trailing zeros are trimmed; at most `maxFraction` digits.
 */
export function formatAmount(value: bigint, decimals: number, maxFraction = 6): FormattedAmount {
  const exact = formatUnits(value, decimals);
  const negative = exact.startsWith("-");
  const [intPart = "0", fracPart = ""] = (negative ? exact.slice(1) : exact).split(".");
  const shown = fracPart.slice(0, maxFraction).replace(/0+$/, "");
  const whole = `${negative ? "−" : ""}${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  return {
    whole,
    fraction: shown,
    truncated: fracPart.replace(/0+$/, "").length > shown.length,
    exact,
  };
}

/** 850 ms / 1.2 s / 14 s. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 1000)} s`;
}
