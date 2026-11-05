import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "info" | "warning" | "danger";
const styles: Record<Tone, { box: string; icon: ReactNode }> = {
  info: {
    box: "border-border bg-sunken text-text",
    icon: <Info size={16} aria-hidden className="text-muted" />,
  },
  warning: {
    box: "border-warning/40 bg-warning-soft text-text",
    icon: <AlertTriangle size={16} aria-hidden className="text-warning" />,
  },
  danger: {
    box: "border-danger/40 bg-danger-soft text-text",
    icon: <CircleAlert size={16} aria-hidden className="text-danger" />,
  },
};

export function Callout({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const s = styles[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cx("flex gap-3 rounded-md border p-4", s.box)}
    >
      <div className="pt-0.5">{s.icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-small font-semibold">{title}</p>
        {children && <div className="text-small text-muted">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Honest empty state: says what's missing and what to do. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-10">
      <p className="text-body font-medium text-text">{title}</p>
      {children && <p className="max-w-prose text-small text-muted">{children}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
