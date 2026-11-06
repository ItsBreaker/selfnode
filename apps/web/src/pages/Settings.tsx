import {
  anonNetworks,
  chains,
  heliosUpstreams,
  isRpcUrl,
  MODES,
  publicRpc,
  ROUTES,
  type AnonNetworkId,
  type ChainKey,
  type Route,
  type TransportSettings,
} from "@selfnode/core";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Page } from "../app/AppShell";
import { MODE_COPY } from "../content/modes";
import { useSwarmArchive } from "../state/labels";
import { useFailover, useSelfnode, useTraffic } from "../state/selfnode";
import { useTheme } from "../theme";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Field } from "../ui/Field";
import { MODE_LABEL } from "../ui/ModeIndicator";
import { Panel } from "../ui/Panel";
import { Segmented } from "../ui/Segmented";
import { ThemeToggle } from "../ui/ThemeToggle";
import { cx } from "../ui/cx";

const CHAIN_KEYS = Object.keys(chains) as ChainKey[];
// Default first. The passthrough worker (not anonymising) is never offered here.
const SELECTABLE_NETWORKS: AnonNetworkId[] = (["nox", "nym", "tor-js"] as const).filter(
  (id) => anonNetworks[id].kind === "network",
);

const NETWORK_NOTES: Record<AnonNetworkId, string> = {
  nox: "Default. Sphinx mixnet; fastest in our tests (about 1–3 s per request).",
  nym: "Nym mixnet. Slower to start; the first request can take 10 s or more.",
  "tor-js":
    "Tor in the browser. Needs a gateway; the public demo gateway was unreachable when we tested it.",
  passthrough: "",
};

export const ROUTE_INFO: Record<Route, { label: string; anonymised: boolean; note: string }> = {
  "anon-rpc": {
    label: "Through Anon-RPC",
    anonymised: true,
    note: "Your IP is hidden from the RPC provider.",
  },
  bootstrap: {
    label: "Bootstrap read",
    anonymised: false,
    note: "One read of the anonymity network's specifier contract at startup.",
  },
  "helios-direct": {
    label: "Helios upstream",
    anonymised: false,
    note: "Verified mode reads; Helios can't use Anon-RPC.",
  },
  "my-node": { label: "Your node", anonymised: false, note: "Reads answered by your own node." },
  "direct-approved": {
    label: "Direct, approved by you",
    anonymised: false,
    note: "One-off direct requests you confirmed.",
  },
};

export function Settings() {
  const { settings, setSettings } = useSelfnode();
  const { pref, setPref } = useTheme();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Page title="Settings" intro="Everything here is stored only in this browser.">
      <div className="flex flex-col gap-6">
        <Panel title="Connection mode">
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map((m) => (
              <ChoiceCard
                key={m}
                selected={settings.mode === m}
                onSelect={() => setSettings({ ...settings, mode: m })}
                title={MODE_LABEL[m]}
                name="mode"
              >
                {MODE_COPY[m].summary}
              </ChoiceCard>
            ))}
          </div>
        </Panel>

        <Panel title="Network">
          <Segmented<ChainKey>
            label="Network"
            value={settings.chain}
            onChange={(chain) => setSettings({ ...settings, chain })}
            options={CHAIN_KEYS.map((k) => ({
              value: k,
              label: chains[k].testnet
                ? `${chains[k].name} (testnet)`
                : `${chains[k].name} (read-only)`,
            }))}
          />
          <p className="mt-3 text-small text-muted">
            Signing is only ever allowed on Sepolia. Ethereum mainnet is read-only in this build.
          </p>
        </Panel>

        <Panel title="Anonymity network">
          <div className="grid gap-3 md:grid-cols-3">
            {SELECTABLE_NETWORKS.map((id) => (
              <ChoiceCard
                key={id}
                name="anon-network"
                selected={settings.anonNetwork === id}
                onSelect={() => setSettings({ ...settings, anonNetwork: id })}
                title={anonNetworks[id].label}
              >
                {NETWORK_NOTES[id]}
              </ChoiceCard>
            ))}
          </div>
          {settings.anonNetwork === "tor-js" && (
            <TorGateway settings={settings} setSettings={setSettings} />
          )}
          <label className="mt-4 flex min-h-11 items-start gap-3 text-small">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--accent)]"
              checked={settings.anonFailover !== false}
              onChange={(e) => {
                const next = { ...settings };
                if (e.target.checked) delete next.anonFailover;
                else next.anonFailover = false;
                setSettings(next);
              }}
            />
            <span>
              <span className="font-medium">Switch networks automatically if this one fails</span>
              <span className="block text-muted">
                On a missing exit, a worker that won&apos;t start, two failures in a row or no
                answer in 20 s, Selfnode moves to the next anonymity network (Nox → Nym → Tor, if
                you set a Tor gateway) and starts the backup in the background. Never to a direct
                connection.
              </span>
            </span>
          </label>
        </Panel>

        <EndpointSettings />

        <Panel title="Appearance">
          <div className="flex items-center justify-between gap-4">
            <span className="text-small text-muted">
              Theme: follows your system until you choose.
            </span>
            <ThemeToggle value={pref} onChange={setPref} />
          </div>
        </Panel>

        <SwarmArchive />

        <TrafficSettings />
      </div>
    </Page>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  name,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer flex-col gap-1 rounded-md border p-4 transition-colors duration-150",
        selected
          ? "border-accent bg-surface shadow-[0_0_0_1px_var(--accent)]"
          : "border-border hover:border-border-strong",
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={selected}
          onChange={onSelect}
          className="size-4 accent-[var(--accent)]"
        />
        <span className="text-body font-semibold">{title}</span>
      </span>
      <span className="text-small text-muted">{children}</span>
    </label>
  );
}

function TorGateway({
  settings,
  setSettings,
}: {
  settings: TransportSettings;
  setSettings: (s: TransportSettings) => void;
}) {
  const current = (settings.anonConfig?.["tor-js"] ?? anonNetworks["tor-js"].defaultConfig) as
    { gateways?: string[] } | undefined;
  const [value, setValue] = useState((current?.gateways ?? []).join(", "));
  const gateways = value
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const valid =
    gateways.length > 0 && gateways.every((g) => /^[^\s:]+:\d{1,5}:[A-Za-z0-9_-]+$/.test(g));
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
      <Field
        label="Tor gateways"
        mono
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hint="host:port:key, comma-separated. Gateways relay encrypted Tor traffic and can't read it. Run your own for anything real."
        error={value && !valid ? "Each gateway must look like host:port:key" : undefined}
      />
      <div>
        <Button
          variant="primary"
          size="sm"
          disabled={!valid}
          onClick={() =>
            setSettings({
              ...settings,
              anonConfig: { ...settings.anonConfig, "tor-js": { gateways } },
            })
          }
        >
          Save gateways
        </Button>
      </div>
    </div>
  );
}

type Draft = Record<"rpc" | "node" | "exec" | "cons", Record<ChainKey, string>>;

function EndpointSettings() {
  const { settings, setSettings } = useSelfnode();
  const init = (): Draft => ({
    rpc: Object.fromEntries(CHAIN_KEYS.map((k) => [k, settings.rpcUrl?.[k] ?? ""])) as Record<
      ChainKey,
      string
    >,
    node: Object.fromEntries(CHAIN_KEYS.map((k) => [k, settings.myNodeUrl?.[k] ?? ""])) as Record<
      ChainKey,
      string
    >,
    exec: Object.fromEntries(
      CHAIN_KEYS.map((k) => [k, settings.helios?.[k]?.executionRpc ?? ""]),
    ) as Record<ChainKey, string>,
    cons: Object.fromEntries(
      CHAIN_KEYS.map((k) => [k, settings.helios?.[k]?.consensusRpc ?? ""]),
    ) as Record<ChainKey, string>,
  });
  const [draft, setDraft] = useState<Draft>(init);
  const [saved, setSaved] = useState(false);
  const bad = (v: string) =>
    v && !isRpcUrl(v) ? "Use an http:// or https:// URL without credentials" : undefined;
  const heliosPairBad = (k: ChainKey) => Boolean(draft.exec[k]) !== Boolean(draft.cons[k]);
  const anyBad = CHAIN_KEYS.some(
    (k) =>
      bad(draft.rpc[k]) ||
      bad(draft.node[k]) ||
      bad(draft.exec[k]) ||
      bad(draft.cons[k]) ||
      heliosPairBad(k),
  );
  const set = (group: keyof Draft, k: ChainKey, v: string) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [group]: { ...d[group], [k]: v } }));
  };

  const save = () => {
    const pick = (g: keyof Draft) => {
      const out: Partial<Record<ChainKey, string>> = {};
      for (const k of CHAIN_KEYS) if (draft[g][k]) out[k] = draft[g][k];
      return Object.keys(out).length ? out : undefined;
    };
    const helios: NonNullable<TransportSettings["helios"]> = {};
    for (const k of CHAIN_KEYS)
      if (draft.exec[k] && draft.cons[k])
        helios[k] = { executionRpc: draft.exec[k], consensusRpc: draft.cons[k] };
    const next: TransportSettings = {
      mode: settings.mode,
      chain: settings.chain,
      anonNetwork: settings.anonNetwork,
    };
    if (settings.anonConfig) next.anonConfig = settings.anonConfig;
    const rpcUrl = pick("rpc");
    if (rpcUrl) next.rpcUrl = rpcUrl;
    const myNodeUrl = pick("node");
    if (myNodeUrl) next.myNodeUrl = myNodeUrl;
    if (Object.keys(helios).length) next.helios = helios;
    setSettings(next);
    setSaved(true);
  };

  return (
    <Panel
      title="Endpoints"
      actions={saved ? <span className="text-small text-muted">Saved</span> : null}
    >
      <div className="flex flex-col gap-8">
        {CHAIN_KEYS.map((k) => (
          <fieldset key={k} className="grid gap-5 md:grid-cols-2">
            <legend className="mb-3 text-small font-semibold">{chains[k].name}</legend>
            <Field
              label="Public RPC (reached through Anon-RPC)"
              mono
              placeholder={publicRpc(k)}
              value={draft.rpc[k]}
              onChange={(e) => set("rpc", k, e.target.value)}
              error={bad(draft.rpc[k])}
              hint="Leave empty for the default."
            />
            <Field
              label="Your node RPC (My node mode)"
              mono
              placeholder="http://127.0.0.1:8545"
              value={draft.node[k]}
              onChange={(e) => set("node", k, e.target.value)}
              error={bad(draft.node[k])}
            />
            <Field
              label="Verified mode: execution RPC"
              mono
              placeholder={heliosUpstreams[k]?.executionRpc ?? "required for Verified mode"}
              value={draft.exec[k]}
              onChange={(e) => set("exec", k, e.target.value)}
              error={
                bad(draft.exec[k]) ??
                (heliosPairBad(k) && !draft.exec[k] ? "Set both endpoints, or neither" : undefined)
              }
            />
            <Field
              label="Verified mode: consensus endpoint"
              mono
              placeholder={heliosUpstreams[k]?.consensusRpc ?? "required for Verified mode"}
              value={draft.cons[k]}
              onChange={(e) => set("cons", k, e.target.value)}
              error={
                bad(draft.cons[k]) ??
                (heliosPairBad(k) && !draft.cons[k] ? "Set both endpoints, or neither" : undefined)
              }
              hint={
                k === "sepolia"
                  ? "No public HTTPS consensus endpoint worked for Sepolia in our tests; use your own node's."
                  : "Helios trusts this endpoint for its starting checkpoint."
              }
            />
          </fieldset>
        ))}
        <div>
          <Button variant="primary" disabled={anyBad} onClick={save}>
            Save endpoints
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Opt-in only: one explicit click per session, never automatic and never remembered. */
function SwarmArchive() {
  const { state, load, unload } = useSwarmArchive();
  const ready = state.status === "ready" ? state.loaded : null;
  return (
    <div id="swarm-archive" className="scroll-mt-6">
      <Panel title="Swarm archive">
        <div className="flex flex-col gap-4">
          <p className="text-small text-muted">
            Selfnode&apos;s labels, tokens and function names are also archived on Swarm, one
            snapshot per dataset. Loading them answers lookups from this device instead of asking
            Arkiv one address at a time, and keeps labels working if Arkiv is unreachable.
          </p>
          <Callout tone="warning" title="The Swarm gateway sees your IP address">
            The snapshots (about 2.7 MB) are downloaded directly from the bzz.limo public gateway,
            not through the anonymity network, so the gateway learns your IP address and that you
            downloaded Selfnode&apos;s label archive. Nothing about your own addresses is sent. Each
            file is used only if its SHA-256 matches the one recorded on Arkiv (or, if Arkiv
            can&apos;t be reached, the one built into this version). Off until you load it, and only
            for this session.
          </Callout>
          {ready ? (
            <div className="flex flex-col gap-3" role="status">
              <p className="text-small">
                <span className="font-medium">Loaded and verified:</span>{" "}
                {ready.index.counts.tokens.toLocaleString()} tokens,{" "}
                {ready.index.counts.labels.toLocaleString()} labels,{" "}
                {ready.index.counts.sigs.toLocaleString()} function names (
                {(ready.bytes / 1_000_000).toFixed(1)} MB; hashes from{" "}
                {ready.pointers === "arkiv"
                  ? "Arkiv"
                  : `this build, because Arkiv's snapshot records couldn't be read: ${ready.pointerError ?? "unknown error"}`}
                ).
              </p>
              <div>
                <Button onClick={unload}>Stop using the archive</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {state.status === "error" && (
                <Callout tone="danger" title="Couldn't load the Swarm archive">
                  {state.message}. Labels still come from Arkiv as usual.
                </Callout>
              )}
              <div>
                <Button
                  variant="primary"
                  busy={state.status === "loading"}
                  onClick={() => void load()}
                >
                  {state.status === "loading"
                    ? `Downloading ${state.done + 1} of ${state.total}…`
                    : "Load labels from the Swarm archive"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function TrafficSettings() {
  const { session, total, failed, resetAll } = useTraffic();
  const failover = useFailover();
  const sum = (s: Record<Route, number>) => ROUTES.reduce((n, r) => n + s[r], 0);
  const pct = (s: Record<Route, number>) =>
    sum(s) ? `${((s["anon-rpc"] / sum(s)) * 100).toFixed(1)}%` : "—";
  return (
    <div id="traffic" className="scroll-mt-6">
      <Panel
        title="Traffic"
        flush
        actions={
          <Button size="sm" onClick={resetAll}>
            Reset counts
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-5 border-b border-border p-5">
          <div>
            <p className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
              Through Anon-RPC · this session
            </p>
            <p className="font-mono text-h2 tabular">{pct(session)}</p>
          </div>
          <div>
            <p className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
              Through Anon-RPC · all time
            </p>
            <p className="font-mono text-h2 tabular">{pct(total)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small sm:min-w-[560px]">
            <thead>
              <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                  Route
                </th>
                <th scope="col" className="hidden px-2 py-2.5 font-medium sm:table-cell">
                  Anonymised
                </th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">
                  Session
                </th>
                <th scope="col" className="px-5 py-2.5 whitespace-nowrap text-right font-medium">
                  All time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROUTES.map((r) => (
                <tr key={r}>
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-medium">{ROUTE_INFO[r].label}</p>
                    <p className="text-caption text-muted">{ROUTE_INFO[r].note}</p>
                    <p className="text-caption font-medium sm:hidden">
                      {ROUTE_INFO[r].anonymised ? "Anonymised" : "Not anonymised"}
                    </p>
                  </td>
                  <td className="hidden px-2 py-3 sm:table-cell">
                    {ROUTE_INFO[r].anonymised ? "Yes" : "No"}
                  </td>
                  <td className="px-2 py-3 text-right font-mono tabular">{session[r]}</td>
                  <td className="px-5 py-3 text-right font-mono tabular">{total[r]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-5 py-3 text-small">
          <span className="font-medium">Failed attempts this session:</span>{" "}
          <span className="font-mono tabular">{failed}</span>
          <span className="block text-caption text-muted">
            Requests that got no answer (timed out, refused, or retried). They aren&apos;t counted
            under any route above, so they don&apos;t change the shares.
          </span>
        </div>
        <div className="border-t border-border px-5 py-3 text-small">
          <span className="font-medium">Network switches this session:</span>{" "}
          <span className="font-mono tabular">{failover.events.length}</span>
          {failover.events.map((e) => (
            <span key={e.at} className="block text-caption text-muted">
              {new Date(e.at).toLocaleTimeString()}: {anonNetworks[e.from].label} →{" "}
              {anonNetworks[e.to].label} ({e.kind === "recovered" ? "switched back: " : ""}
              {e.reason})
            </span>
          ))}
        </div>
        <div className="p-5">
          <Callout title="What's counted">
            Every JSON-RPC call Selfnode actually sent and got an answer for, by the route it took;
            a batched request counts once per call inside it. Bootstrap reads are the one-time,
            disclosed lookups of each network's worker code when it starts. Counts are stored only
            in this browser and never sent anywhere.
          </Callout>
        </div>
      </Panel>
    </div>
  );
}
