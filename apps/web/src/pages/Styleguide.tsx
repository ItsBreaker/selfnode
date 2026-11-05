/**
 * Internal style guide: tokens, type scale and core components in both themes.
 * Every value on this page is an EXAMPLE passed as props, labelled as such;
 * nothing here is presented as live data.
 */
import { ArrowRight, Send } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Header } from "../app/Header";
import { Address } from "../ui/Address";
import { Amount } from "../ui/Amount";
import { Badge, StatusDot } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Callout, EmptyState } from "../ui/Callout";
import { Field } from "../ui/Field";
import { Kbd } from "../ui/Kbd";
import { ModeIndicator } from "../ui/ModeIndicator";
import { Panel } from "../ui/Panel";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { ThemeToggle } from "../ui/ThemeToggle";
import { cx } from "../ui/cx";
import type { ThemePref } from "../theme";

type View = "light" | "dark" | "both";

const EXAMPLE = {
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  router: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
  tx: "0x41f65cbe8b3296b324b566939dc86a1c8749adb6c5b894fb069b4b4ae786f109",
};

export function Styleguide({
  pref,
  setPref,
}: {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}) {
  const [params] = useSearchParams();
  const initial = params.get("view");
  const [view, setView] = useState<View>(
    initial === "dark" || initial === "both" ? initial : "light",
  );

  return (
    <div data-theme={view === "both" ? undefined : view} className="min-h-dvh">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 pb-6 pt-10">
        <div>
          <p className="text-caption font-medium uppercase tracking-[0.08em] text-muted">
            Internal
          </p>
          <h1 className="text-h1">Style guide</h1>
          <p className="mt-1 max-w-prose text-body text-muted">
            Tokens, type and core components. All values shown are examples passed as props.
          </p>
        </div>
        <Segmented<View>
          label="Preview theme"
          value={view}
          onChange={setView}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "both", label: "Side by side" },
          ]}
        />
      </div>
      {view === "both" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2">
          <Gallery theme="light" pref={pref} setPref={setPref} compact />
          <Gallery theme="dark" pref={pref} setPref={setPref} compact />
        </div>
      ) : (
        <Gallery theme={view} pref={pref} setPref={setPref} />
      )}
    </div>
  );
}

function Gallery({
  theme,
  pref,
  setPref,
  compact,
}: {
  theme: "light" | "dark";
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  compact?: boolean;
}) {
  return (
    <div data-theme={theme} className="border-t border-border pb-24">
      {/* The header's breakpoints follow the viewport, so it is only shown in single-theme views. */}
      {!compact && (
        <>
          <p className="mx-auto max-w-6xl px-5 pb-2 pt-6 text-caption font-medium uppercase tracking-[0.08em] text-muted">
            Header · persistent on every page
          </p>
          <div className="border-y border-border">
            <Header
              modeIndicator={
                <ModeIndicator
                  mode="private"
                  state="ready"
                  via="via Nox"
                  chain="Sepolia"
                  latencyMs={1240}
                />
              }
              themeToggle={<ThemeToggle value={pref} onChange={setPref} />}
            />
          </div>
        </>
      )}
      <div
        className={cx(
          "mx-auto flex flex-col gap-14 px-5 pt-12",
          compact ? "max-w-3xl" : "max-w-6xl",
        )}
      >
        <Section
          title="Colour"
          note="Neutral warm base, one accent, semantic states. All text pairs pass WCAG AA (enforced by tests)."
        >
          <Swatches />
        </Section>

        <Section
          title="Type"
          note="Instrument Sans for UI; JetBrains Mono for addresses, hashes and amounts (tabular)."
        >
          <TypeScale />
        </Section>

        <Section title="Connection mode">
          <div className="flex flex-col items-start gap-3">
            <ModeIndicator mode="private" state="starting" via="via Nox" chain="Sepolia" />
            <ModeIndicator
              mode="private"
              state="ready"
              via="via Nox"
              chain="Sepolia"
              latencyMs={1240}
            />
            <ModeIndicator
              mode="private"
              state="degraded"
              via="via Nym"
              chain="Sepolia"
              latencyMs={13100}
              problem="slow network"
            />
            <ModeIndicator
              mode="private"
              state="failed"
              via="via Tor"
              chain="Sepolia"
              problem="Tor gateway unreachable"
            />
            <ModeIndicator
              mode="verified"
              state="ready"
              via="Helios · direct"
              chain="Ethereum"
              latencyMs={463}
            />
            <ModeIndicator
              mode="mynode"
              state="ready"
              via="127.0.0.1:8545"
              chain="Sepolia"
              latencyMs={38}
            />
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Send size={16} aria-hidden />}>
              Review transaction
            </Button>
            <Button>Cancel</Button>
            <Button variant="ghost">Details</Button>
            <Button variant="danger">Remove wallet</Button>
            <Button variant="primary" busy>
              Broadcasting
            </Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
          </div>
        </Section>

        <Section title="Fields">
          <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
            <Field
              label="Recipient"
              placeholder="0x… or name.eth"
              mono
              hint="Address or ENS name"
            />
            <Field
              label="Amount"
              placeholder="0.0"
              mono
              inputMode="decimal"
              trailing={<span className="text-small text-muted">ETH</span>}
            />
            <Field
              label="Node RPC URL"
              defaultValue="ftp://node"
              error="Use an http:// or https:// URL"
              mono
            />
            <Field
              label="Slippage"
              defaultValue="0.5"
              mono
              trailing={<span className="text-small text-muted">%</span>}
            />
          </div>
        </Section>

        <Section title="Badges and status">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="private">Private</Badge>
            <Badge tone="verified">Verified</Badge>
            <Badge tone="mynode">My node</Badge>
            <Badge tone="warning">Archive node needed</Badge>
            <Badge tone="danger">Flagged address</Badge>
            <Badge>Testnet</Badge>
            <span className="inline-flex items-center gap-2 text-small text-muted">
              <StatusDot tone="private" /> ready
            </span>
            <span className="inline-flex items-center gap-2 text-small text-muted">
              <StatusDot tone="warning" pulsing /> syncing
            </span>
          </div>
        </Section>

        <Section
          title="Addresses and amounts"
          note="Label first, short hex second, copy always available. Example label shown."
        >
          <div className="flex flex-col gap-4">
            <Address
              address={EXAMPLE.weth}
              label={{ name: "Wrapped Ether", source: "example label", fromArkiv: true }}
            />
            <Address address={EXAMPLE.router} />
            <div className="flex flex-wrap items-baseline gap-8">
              <Amount value={1234567891234567891n} decimals={18} symbol="ETH" size="h1" />
              <Amount value={26355806n} decimals={6} symbol="USDC" size="lead" />
              <Amount value={0n} decimals={18} symbol="ETH" />
            </div>
          </div>
        </Section>

        <Section title="Panel, table and loading">
          <div className="grid gap-5">
            <Panel title="Recent activity" actions={<Badge>Example</Badge>} flush>
              <ExampleTable />
            </Panel>
            <Panel title="Recent activity" actions={<Badge>Loading</Badge>} flush>
              <SkeletonTable />
            </Panel>
          </div>
        </Section>

        <Section title="Messages and empty states">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Callout tone="info" title="Full history needs an archive node">
              Public RPCs only return recent state. Connect an archive node in Settings to see every
              transaction.
            </Callout>
            <Callout tone="warning" title="This request will not be anonymised">
              Sending directly reveals your IP address to the RPC provider, linked to this address.
            </Callout>
            <Callout
              tone="danger"
              title="Anonymity network unavailable"
              action={<Button size="sm">Try again</Button>}
            >
              Nox did not respond within 45 s. Selfnode will not fall back to a direct connection.
            </Callout>
            <Panel>
              <EmptyState
                title="No tokens yet"
                action={
                  <Button size="sm" variant="primary" icon={<ArrowRight size={14} aria-hidden />}>
                    Receive
                  </Button>
                }
              >
                Tokens sent to this address on Sepolia will appear here.
              </EmptyState>
            </Panel>
          </div>
        </Section>

        <Section title="Keyboard">
          <p className="text-body text-muted">
            Open search with <Kbd>⌘</Kbd> <Kbd>K</Kbd>. Every control is reachable with{" "}
            <Kbd>Tab</Kbd> and shows a focus ring.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 md:grid-cols-[180px_1fr]">
      <div>
        <h2 className="text-small font-semibold text-text">{title}</h2>
        {note && <p className="mt-1 text-caption text-muted">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const SWATCHES = [
  ["bg", "surface", "sunken", "border", "border-strong"],
  ["text", "muted", "accent", "accent-soft", "focus"],
  ["private", "verified", "mynode", "warning", "danger"],
  ["private-soft", "verified-soft", "mynode-soft", "warning-soft", "danger-soft"],
] as const;

function Swatches() {
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    setValues(
      Object.fromEntries(SWATCHES.flat().map((n) => [n, cs.getPropertyValue(`--${n}`).trim()])),
    );
  }, []);
  return (
    <div ref={ref} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {SWATCHES.flat().map((name) => (
        <div key={name} className="overflow-hidden rounded-md border border-border bg-surface">
          <div className="h-12 border-b border-border" style={{ background: `var(--${name})` }} />
          <div className="px-2.5 py-2">
            <p className="text-caption font-medium text-text">{name}</p>
            <p className="font-mono text-caption text-muted uppercase">{values[name] ?? ""}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TypeScale() {
  const rows: [string, string, ReactNode][] = [
    ["display · 44", "text-display font-semibold tracking-tight", "Your node, your rules"],
    ["h1 · 34", "text-h1", "Wallet"],
    ["h2 · 26", "text-h2", "Recent transactions"],
    ["h3 · 20", "text-h3", "Pre-sign preview"],
    [
      "lead · 17",
      "text-lead text-muted",
      "Every request goes through an anonymity network by default.",
    ],
    [
      "body · 15",
      "text-body",
      "Selfnode never falls back to a direct connection without asking you first.",
    ],
    ["small · 13", "text-small text-muted", "Quoted on-chain via the Uniswap v4 Quoter."],
    [
      "caption · 12",
      "text-caption text-muted uppercase tracking-[0.08em] font-medium",
      "Network fee",
    ],
    ["mono · 13", "font-mono text-small tabular break-all", EXAMPLE.tx],
    ["numerals", "font-mono text-lead tabular", "1,234.567891 · 0.000021 · 26.355806"],
  ];
  return (
    <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
      {rows.map(([meta, cls, sample]) => (
        <div key={meta} className="grid items-baseline gap-2 px-4 py-3 sm:grid-cols-[120px_1fr]">
          <span className="font-mono text-caption text-muted">{meta}</span>
          <span className={cx("min-w-0 break-words text-text", cls)}>{sample}</span>
        </div>
      ))}
    </div>
  );
}

const ROWS = [
  {
    kind: "Swap",
    detail: <span className="whitespace-nowrap">ETH → USDC</span>,
    amount: <Amount value={1000000000000000n} decimals={18} symbol="ETH" />,
    status: <Badge tone="verified">Confirmed</Badge>,
  },
  {
    kind: "Send",
    detail: <Address address={EXAMPLE.router} />,
    amount: <Amount value={1n} decimals={18} symbol="ETH" maxFraction={4} />,
    status: <Badge tone="verified">Confirmed</Badge>,
  },
  {
    kind: "Receive",
    detail: (
      <Address
        address={EXAMPLE.weth}
        label={{ name: "Wrapped Ether", source: "example label", fromArkiv: true }}
      />
    ),
    amount: <Amount value={26355806n} decimals={6} symbol="USDC" />,
    status: <Badge tone="warning">Pending</Badge>,
  },
];

function ExampleTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed text-left text-small">
        <thead>
          <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
            <th scope="col" className="w-28 px-5 py-2.5 font-medium">
              Type
            </th>
            <th scope="col" className="px-2 py-2.5 font-medium">
              Detail
            </th>
            <th scope="col" className="w-40 px-2 py-2.5 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="w-32 px-5 py-2.5 text-right font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ROWS.map((r, i) => (
            <tr key={i} className="hover:bg-sunken/60">
              <td className="px-5 py-3 font-medium text-text">{r.kind}</td>
              <td className="overflow-hidden px-2 py-3 text-muted">{r.detail}</td>
              <td className="whitespace-nowrap px-2 py-3 text-right">{r.amount}</td>
              <td className="px-5 py-3 text-right">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div aria-busy="true" aria-label="Loading recent activity">
      <div className="flex border-b border-border px-5 py-3">
        <Skeleton className="h-3 w-24" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0"
        >
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
