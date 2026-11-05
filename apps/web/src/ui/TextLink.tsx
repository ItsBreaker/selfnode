import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx";

/** Links are always underlined: the ink accent alone doesn't distinguish them. */
export function TextLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        "font-medium text-accent underline decoration-border-strong underline-offset-[3px] hover:decoration-accent",
        className,
      )}
    >
      {children}
    </Link>
  );
}
