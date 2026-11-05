import { formatDuration, type ConnectionState, type Mode } from "@selfnode/core";
import { ChevronDown } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { StatusDot, type Tone } from "./Badge";
import { cx } from "./cx";

export const MODE_LABEL: Record<Mode, string> = {
  private: "Private",
  verified: "Verified",
  mynode: "My node",
};
export const MODE_TONE: Record<Mode, Tone> = {
  private: "private",
  verified: "verified",
  mynode: "mynode",
};
export const STATE_LABEL: Record<ConnectionState, string> = {
  starting: "Connecting",
  ready: "Ready",
  slow: "Slow",
  failed: "Unavailable",
};

export interface ModeIndicatorProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  mode: Mode;
  state: ConnectionState;
  /** Route detail, e.g. "via Nox", "Helios · direct", "127.0.0.1:8545". */
  via: string;
  chain: string;
  latencyMs?: number | null | undefined;
  problem?: string | null | undefined;
  /** Requests that went direct (user-approved) this session. */
  direct?: number;
}

/**
 * The persistent connection-mode indicator. The mode is the product, so this
 * always tells the truth: any state other than "ready" is labelled in words
 * (never colour alone), and any direct request is flagged in amber.
 */
export const ModeIndicator = forwardRef<HTMLButtonElement, ModeIndicatorProps>(
  function ModeIndicator(
    { mode, state, via, chain, latencyMs, problem, direct = 0, className, ...rest },
    ref,
  ) {
    const tone: Tone =
      state === "failed" ? "danger" : state === "slow" ? "warning" : MODE_TONE[mode];
    const detail =
      state === "starting"
        ? `${via}…`
        : state === "failed"
          ? (problem ?? via)
          : [via, latencyMs != null ? formatDuration(latencyMs) : null].filter(Boolean).join(" · ");
    const flagged = state !== "ready";
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        aria-label={`Connection: ${MODE_LABEL[mode]} on ${chain}, ${STATE_LABEL[state]}, ${detail}${
          direct ? `, ${direct} direct request${direct === 1 ? "" : "s"} this session` : ""
        }. Show connection details`}
        className={cx(
          "group inline-flex h-11 items-center gap-2 rounded-md border bg-surface pl-3 pr-2 sm:h-9 sm:gap-2.5",
          "transition-colors duration-150 hover:border-border-strong",
          state === "failed"
            ? "border-danger/60"
            : state === "slow" || direct
              ? "border-warning/60"
              : "border-border",
          className,
        )}
      >
        <StatusDot tone={tone} pulsing={state === "starting"} />
        <span className="text-small font-semibold text-text">{MODE_LABEL[mode]}</span>
        {flagged && (
          <span
            className={cx(
              "rounded-sm px-1.5 py-px text-caption font-semibold",
              state === "failed"
                ? "bg-danger-soft text-danger"
                : state === "slow"
                  ? "bg-warning-soft text-warning"
                  : "bg-sunken text-muted",
            )}
          >
            {STATE_LABEL[state]}
          </span>
        )}
        {direct > 0 && (
          <span className="rounded-sm bg-warning-soft px-1.5 py-px text-caption font-semibold text-warning">
            {direct} direct
          </span>
        )}
        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
        <span className="hidden text-small text-muted sm:inline">{chain}</span>
        <span
          className={cx(
            "hidden max-w-64 truncate font-mono text-caption tabular md:inline",
            state === "failed" ? "text-danger" : state === "slow" ? "text-warning" : "text-muted",
          )}
        >
          {detail}
        </span>
        <ChevronDown size={14} aria-hidden className="text-muted group-hover:text-text" />
      </button>
    );
  },
);
