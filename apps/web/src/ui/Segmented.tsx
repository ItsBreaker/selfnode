import * as TG from "@radix-ui/react-toggle-group";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is icon-only. */
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <TG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className="inline-flex rounded-md border border-border bg-sunken p-0.5"
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cx(
            "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium text-muted",
            "transition-colors duration-150 hover:text-text",
            "data-[state=on]:bg-surface data-[state=on]:text-text data-[state=on]:shadow-[0_0_0_1px_var(--border)]",
            size === "sm" ? "h-7 px-2 text-caption" : "h-8 px-3 text-small",
          )}
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}
