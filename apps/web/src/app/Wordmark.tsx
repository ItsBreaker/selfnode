import { brand } from "@selfnode/core";

/** Text wordmark with a small geometric node mark. No external assets. */
export function Wordmark() {
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
      <span className="text-body font-semibold tracking-tight text-text">{brand.name}</span>
    </span>
  );
}
