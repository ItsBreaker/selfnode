import { formatDuration, type Mode } from "@selfnode/core";
import { ChevronDown } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { StatusDot, type Tone } from "./Badge";
import { cx } from "./cx";

export type ModeState = "starting" | "ready" | "degraded" | "failed";

export const MODE_LABEL: Record<Mode, string> = {
  private: "Private",
  verified: "Verified",
  mynode: "My node",
};
const MODE_TONE: Record<Mode, Tone> = {
  private: "private",
  verified: "verified",
  mynode: "mynode",
};

export interface ModeIndicatorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode: Mode;
  state: ModeState;
  /** The route detail, e.g. "via Nox", "Helios · direct", "127.0.0.1". */
  via: string;
  chain: string;
  latencyMs?: number | null | undefined;
  /** Shown when degraded/failed. */
  problem?: string | undefined;
}

/**
 * The persistent connection-mode indicator. The mode is the product, so this
 * is always visible in the header and always tells the truth about its state.
 */
export const ModeIndicator = forwardRef<HTMLButtonElement, ModeIndicatorProps>(
  function ModeIndicator({ mode, state, via, chain, latencyMs, problem, className, ...rest }, ref) {
    const tone: Tone =
      state === "failed" ? "danger" : state === "degraded" ? "warning" : MODE_TONE[mode];
    const detail =
      state === "starting"
        ? `connecting ${via}…`
        : state === "failed"
          ? (problem ?? "unavailable")
          : [
              via,
              latencyMs != null ? formatDuration(latencyMs) : null,
              state === "degraded" ? (problem ?? "slow") : null,
            ]
              .filter(Boolean)
              .join(" · ");
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        aria-label={`Connection: ${MODE_LABEL[mode]} on ${chain}, ${detail}. Change connection mode`}
        className={cx(
          "group inline-flex h-9 items-center gap-2.5 rounded-md border border-border bg-surface pl-3 pr-2",
          "hover:border-border-strong transition-colors duration-150",
          state === "failed" && "border-danger/50",
          className,
        )}
      >
        <StatusDot tone={tone} pulsing={state === "starting"} />
        <span className="text-small font-semibold text-text">{MODE_LABEL[mode]}</span>
        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
        <span className="hidden text-small text-muted sm:inline">{chain}</span>
        <span
          className={cx(
            // On small screens the detail is hidden only while healthy: a problem
            // must never be signalled by colour alone.
            "max-w-32 truncate font-mono text-caption tabular sm:inline sm:max-w-72",
            state === "ready" ? "hidden" : "inline",
            state === "failed"
              ? "text-danger"
              : state === "degraded"
                ? "text-warning"
                : "text-muted",
          )}
        >
          {detail}
        </span>
        <ChevronDown size={14} aria-hidden className="text-muted group-hover:text-text" />
      </button>
    );
  },
);
