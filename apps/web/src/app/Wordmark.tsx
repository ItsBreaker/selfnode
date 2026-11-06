import { brand } from "@selfnode/core";
import { cx } from "../ui/cx";

/**
 * The Selfnode mark (docs/brand/selfnode-logo.svg, redrawn from the source logo):
 * a teal diamond over two stacked chevrons. The diamond uses the Private teal
 * token and the chevrons the text colour, so it works in both themes.
 */
export function Mark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={(size * 729) / 820}
      height={size}
      viewBox="262 228 729 820"
      aria-hidden
      className={className}
    >
      <path
        className="fill-private"
        fillRule="evenodd"
        d="M626.5 235.63 L982.5 441.04 L982.5 513.03 L626.5 710.61 L270.5 513.03 L270.5 441.04 Z M626.5 334.94 L866.42 472.41 L626.5 607.73 L386.58 472.41 Z"
      />
      <path
        className="fill-text"
        d="M626.5 776.04 L945.81 598.82 L982.5 616.76 L982.5 677.21 L626.5 877.64 L270.5 677.21 L270.5 616.76 L307.19 598.82 Z M626.5 935.21 L945.45 760.75 L982.5 778.42 L982.5 840.16 L626.5 1039.16 L270.5 840.16 L270.5 778.42 L307.55 760.75 Z"
      />
    </svg>
  );
}

/** `compact`: below the sm breakpoint only the mark shows (the name stays for screen readers). */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark />
      <span
        className={cx(
          "text-body font-semibold tracking-tight text-text",
          compact && "max-sm:sr-only",
        )}
      >
        {brand.name}
      </span>
    </span>
  );
}
