import { brand } from "@selfnode/core";
import { cx } from "../ui/cx";

/** Text wordmark with a small geometric node mark. No external assets. */
/** `compact`: below the sm breakpoint only the mark shows (the name stays for screen readers). */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="text-accent">
        <rect
          x="1"
          y="1"
          width="16"
          height="16"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="9" cy="9" r="3" fill="currentColor" />
      </svg>
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
