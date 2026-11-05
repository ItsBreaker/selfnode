import type { ReactNode } from "react";
import { cx } from "./cx";

export type Tone = "neutral" | "private" | "verified" | "mynode" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  private: "bg-private-soft text-private",
  verified: "bg-verified-soft text-verified",
  mynode: "bg-mynode-soft text-mynode",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption font-medium",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const dotTones: Record<Tone, string> = {
  neutral: "bg-muted",
  private: "bg-private",
  verified: "bg-verified",
  mynode: "bg-mynode",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function StatusDot({
  tone,
  pulsing,
  label,
}: {
  tone: Tone;
  pulsing?: boolean;
  label?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        "inline-block size-2 shrink-0 rounded-full",
        dotTones[tone],
        pulsing && "animate-[sn-pulse_1.6s_ease-in-out_infinite]",
      )}
    />
  );
}
