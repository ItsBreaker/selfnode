import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { SearchDialog } from "../pages/explore/SearchDialog";
import { Kbd } from "../ui/Kbd";
import { cx } from "../ui/cx";
import { NAV } from "./nav";

export { NAV };
import { Wordmark } from "./Wordmark";

export function Header({
  modeIndicator,
  themeToggle,
  mobileNav,
}: {
  modeIndicator: ReactNode;
  themeToggle: ReactNode;
  mobileNav?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-5 sm:px-5">
        <NavLink
          to="/"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center"
          aria-label="Selfnode overview"
        >
          <Wordmark compact />
        </NavLink>
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  "rounded-sm px-2.5 py-1.5 text-small font-medium transition-colors duration-150",
                  isActive ? "text-text" : "text-muted hover:text-text",
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {n.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-accent"
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-small text-muted hover:border-border-strong sm:h-9"
                aria-label="Search addresses, transactions, blocks or ENS names"
              >
                <Search size={14} aria-hidden />
                <span className="hidden 2xl:inline">Search</span>
                <span className="hidden 2xl:inline-flex">
                  <Kbd>⌘K</Kbd>
                </span>
              </button>
            }
          />
          {modeIndicator}
          <div className="hidden md:block">{themeToggle}</div>
          {mobileNav}
        </div>
      </div>
    </header>
  );
}
