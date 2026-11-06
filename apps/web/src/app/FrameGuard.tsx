/**
 * Clickjacking defence. If Selfnode is running inside someone else's frame
 * (possible on the Swarm copy, which can't send X-Frame-Options), don't render
 * anything that signs or reveals secrets: wallet, send, swap, recovery phrase.
 * On Cloudflare, X-Frame-Options: DENY and frame-ancestors already block
 * framing; this is defence in depth.
 *
 * Our own Anon-RPC sandbox iframe is a separate static page
 * (anon-rpc-iframe.html) that never loads the app, so it's unaffected.
 */
import type { ReactNode } from "react";
import { Page } from "./AppShell";
import { Callout } from "../ui/Callout";

export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true; // a cross-origin parent that throws on access is still a parent
  }
}

export function FrameGuard({ title, children }: { title: string; children: ReactNode }) {
  if (!isFramed()) return <>{children}</>;
  const url = window.location.href;
  return (
    <Page title={title}>
      <Callout tone="warning" title="Open Selfnode directly">
        <span className="flex flex-col gap-2">
          <span>
            This page is being shown inside another website, so the wallet, sending, swapping and
            the recovery phrase are switched off here: a site that frames Selfnode could trick you
            into clicking something you didn&apos;t mean to.
          </span>
          <a
            className="font-medium underline underline-offset-2"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Selfnode in its own tab
          </a>
        </span>
      </Callout>
    </Page>
  );
}
