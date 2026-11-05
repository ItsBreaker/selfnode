import { brand } from "@selfnode/core";
import { Outlet } from "react-router";
import { useWarmRoute } from "../state/selfnode";
import { useTheme } from "../theme";
import { ThemeToggle } from "../ui/ThemeToggle";
import { ConnectionControl } from "./ConnectionControl";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";

export function AppShell() {
  const { pref, setPref } = useTheme();
  useWarmRoute();
  const toggle = <ThemeToggle value={pref} onChange={setPref} />;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Header
        modeIndicator={<ConnectionControl />}
        themeToggle={toggle}
        mobileNav={<MobileNav themeToggle={toggle} />}
      />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-caption text-muted">
          <span>
            {brand.name} · {brand.license} licensed · no analytics, no trackers
          </span>
          <a
            href={brand.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-text"
          >
            Source code
          </a>
        </div>
      </footer>
    </div>
  );
}

/** Page frame: consistent title block and width. */
export function Page({
  title,
  intro,
  children,
  actions,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">{title}</h1>
          {intro && <p className="mt-1 max-w-prose text-body text-muted">{intro}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
