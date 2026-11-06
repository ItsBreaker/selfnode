/**
 * The header's connection control: the live mode indicator plus a popover with
 * the route, latency, what this mode hides and doesn't, and a mode switch.
 */
import {
  anonNetworks,
  formatDuration,
  MODES,
  ROUTES,
  type AnonNetworkId,
  type Mode,
  type NetworkTestResult,
} from "@selfnode/core";
import * as Popover from "@radix-ui/react-popover";
import { Check, Minus } from "lucide-react";
import { useState } from "react";
import { MODE_COPY } from "../content/modes";
import { useConnection, useFailover, useSelfnode, useTraffic } from "../state/selfnode";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { MODE_LABEL, ModeIndicator, STATE_LABEL } from "../ui/ModeIndicator";
import { Segmented } from "../ui/Segmented";
import { TextLink } from "../ui/TextLink";

export function ConnectionControl() {
  const c = useConnection();
  const failover = useFailover();
  const { settings, setSettings } = useSelfnode();
  const { session, failed } = useTraffic();
  const total = ROUTES.reduce((n, r) => n + session[r], 0);
  const share = total ? Math.round((session["anon-rpc"] / total) * 100) : null;
  const copy = MODE_COPY[settings.mode];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <ModeIndicator
          mode={settings.mode}
          state={c.state}
          via={c.via}
          chain={c.chainName}
          latencyMs={c.latencyMs}
          problem={c.problem}
          direct={c.direct}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(26rem,calc(100vw-24px))] rounded-md border border-border bg-surface text-text shadow-pop"
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-body font-semibold">{MODE_LABEL[settings.mode]} mode</p>
                <p className="text-small text-muted">{copy.summary}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">
                {STATE_LABEL[c.state]}
                {c.problem ? ` · ${c.problem}` : ""}
              </dd>
              <dt className="text-muted">Route</dt>
              <dd className="font-mono text-caption tabular">{c.via}</dd>
              <dt className="text-muted">Network</dt>
              <dd>{c.chainName}</dd>
              <dt className="text-muted">Latency</dt>
              <dd className="font-mono text-caption tabular">
                {c.latencyMs != null ? formatDuration(c.latencyMs) : "—"}
              </dd>
              <dt className="text-muted">Via Anon-RPC</dt>
              <dd className="font-mono text-caption tabular">
                {share === null ? "no requests yet" : `${share}% of ${total} requests this session`}
              </dd>
              {failed > 0 && (
                <>
                  <dt className="text-muted">Failed attempts</dt>
                  <dd className="font-mono text-caption tabular">
                    {failed} (no answer; not counted above)
                  </dd>
                </>
              )}
            </dl>

            {failover.events.length > 0 && failover.active === settings.anonNetwork && (
              <p className="text-caption text-muted">
                Network switches this session:{" "}
                {failover.events
                  .map(
                    (e) =>
                      `${new Date(e.at).toLocaleTimeString()} ${anonNetworks[e.from].label} → ${anonNetworks[e.to].label}${e.kind === "recovered" ? " (back)" : ""}`,
                  )
                  .join(", ")}
                .
              </p>
            )}

            {failover.active !== settings.anonNetwork && (
              <Callout
                tone="warning"
                title={`${anonNetworks[settings.anonNetwork].label} unavailable, switched to ${anonNetworks[failover.active].label}`}
              >
                <span className="flex flex-col gap-2">
                  <span>
                    {failover.events.map((e) => (
                      <span key={e.at} className="block">
                        {new Date(e.at).toLocaleTimeString()}: {anonNetworks[e.from].label} →{" "}
                        {anonNetworks[e.to].label} ({e.reason})
                      </span>
                    ))}
                    Still anonymised: Selfnode never switches to a direct connection. It checks{" "}
                    {anonNetworks[settings.anonNetwork].label} again every few minutes and switches
                    back when it answers.
                  </span>
                  {failover.active !== settings.anonNetwork && (
                    <span>
                      <Button size="sm" onClick={failover.retry}>
                        Try {anonNetworks[settings.anonNetwork].label} again
                      </Button>
                    </span>
                  )}
                </span>
              </Callout>
            )}

            {settings.mode === "private" && <TestConnection test={failover.test} />}

            {c.direct > 0 && (
              <Callout
                tone="warning"
                title={`${c.direct} request${c.direct === 1 ? "" : "s"} went direct this session`}
              >
                You approved {c.direct === 1 ? "it" : "them"}. Direct requests reveal your IP
                address to the RPC provider.
              </Callout>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <List title="Hides" items={copy.hides} positive />
              <List title="Doesn't hide" items={copy.reveals} />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
                Switch mode
              </p>
              <Segmented<Mode>
                label="Connection mode"
                value={settings.mode}
                onChange={(mode) => setSettings({ ...settings, mode })}
                options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
              <p className="flex flex-wrap gap-x-4 text-small text-muted">
                <TextLink to="/privacy" className="inline-flex min-h-11 items-center sm:min-h-0">
                  Privacy report
                </TextLink>
                <TextLink to="/settings" className="inline-flex min-h-11 items-center sm:min-h-0">
                  Connection settings
                </TextLink>
              </p>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function List({ title, items, positive }: { title: string; items: string[]; positive?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-medium uppercase tracking-[0.06em] text-muted">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-small leading-snug">
            {positive ? (
              <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-private" />
            ) : (
              <Minus size={14} aria-hidden className="mt-0.5 shrink-0 text-muted" />
            )}
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One eth_chainId through each network failover could use; doesn't switch. */
function TestConnection({
  test,
}: {
  test: (onResult?: (r: NetworkTestResult) => void) => Promise<NetworkTestResult[]>;
}) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Partial<Record<AnonNetworkId, NetworkTestResult>>>({});
  const run = async () => {
    setRunning(true);
    setResults({});
    try {
      await test((r) => setResults((prev) => ({ ...prev, [r.id]: r })));
    } finally {
      setRunning(false);
    }
  };
  const rows = Object.values(results);
  return (
    <div className="flex flex-col gap-2">
      <span>
        <Button size="sm" busy={running} onClick={() => void run()}>
          Test connection
        </Button>
      </span>
      {(running || rows.length > 0) && (
        <ul className="flex flex-col gap-1 text-small" aria-live="polite">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{anonNetworks[r.id].label}</span>
              <span className={r.ok ? "text-private" : "text-danger"}>
                {r.ok ? `OK · ${formatDuration(r.ms)}` : `Failed · ${r.error ?? "no answer"}`}
              </span>
            </li>
          ))}
          {running && (
            <li className="text-caption text-muted">
              Waiting for the others (a first connection can take a minute or two)…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
