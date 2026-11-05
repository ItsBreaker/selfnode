import type { ReactNode } from "react";
import { cx } from "./cx";

export function Panel({
  title,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding (tables). */
  flush?: boolean;
}) {
  return (
    <section className={cx("min-w-0 rounded-md border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          {title && <h2 className="text-small font-semibold tracking-normal text-text">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
