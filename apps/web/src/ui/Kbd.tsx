import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-sunken px-1 font-mono text-caption text-muted">
      {children}
    </kbd>
  );
}
