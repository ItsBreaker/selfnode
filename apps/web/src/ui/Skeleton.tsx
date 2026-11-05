import { cx } from "./cx";

/** Layout-matching placeholder. Shimmer is disabled under prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "block rounded-sm bg-sunken",
        "bg-[linear-gradient(90deg,transparent_0%,var(--border)_50%,transparent_100%)] bg-[length:200%_100%]",
        "animate-[sn-shimmer_1.8s_linear_infinite]",
        className,
      )}
    />
  );
}
