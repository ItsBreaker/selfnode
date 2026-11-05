import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-text border border-border-strong hover:bg-sunken",
  ghost: "bg-transparent text-text border border-transparent hover:bg-sunken",
  danger: "bg-danger text-on-danger border border-transparent hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-small gap-1.5",
  md: "h-10 px-4 text-body gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  busy?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap",
        "transition-colors duration-150 select-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin",
        className,
      )}
    />
  );
}
