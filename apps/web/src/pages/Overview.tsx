import { anonNetworks, chains, formatAmount, ROUTES } from "@selfnode/core";
import { useQuery } from "@tanstack/react-query";
import { MODE_COPY } from "../content/modes";
import { Page } from "../app/AppShell";
import {
  useConnection,
  usePublicClient,
  useRouteKey,
  useSelfnode,
  useTraffic,
} from "../state/selfnode";
import { Badge } from "../ui/Badge";
import { Callout, EmptyState } from "../ui/Callout";
import { MODE_LABEL, MODE_TONE, STATE_LABEL } from "../ui/ModeIndicator";
import { Panel } from "../ui/Panel";
import { Skeleton } from "../ui/Skeleton";
import { TextLink } from "../ui/TextLink";

export function Overview() {
  const { settings } = useSelfnode();
  const c = useConnection();
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const chain = chains[settings.chain];

  // One batched round trip: block number and gas price (live, via the active route).
  const head = useQuery({
    queryKey: ["head", routeKey],
    queryFn: async () => {
      const [block, gasPrice] = await Promise.all([
        client.getBlock({ blockTag: "latest" }),
        client.getGasPrice(),
      ]);
      return { number: block.number, timestamp: block.timestamp, gasPrice };
    },
    refetchInterval: 15_000,
    retry: false,
  });

  return (
    <Page title="Overview" intro={MODE_COPY[settings.mode].summary}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Connection"
          className="lg:col-span-2"
          actions={<Badge tone={MODE_TONE[settings.mode]}>{MODE_LABEL[settings.mode]}</Badge>}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label="Status" value={STATE_LABEL[c.state]} />
            <Stat
              label="Network"
              value={chain.name}
              sub={chain.testnet ? "Testnet · signing enabled" : "Read-only"}
            />
            <Stat label="Route" value={c.via} mono />
            <Stat
              label="Latency"
              value={c.latencyMs != null ? `${(c.latencyMs / 1000).toFixed(1)} s` : "—"}
              mono
            />
            <Stat
              label="Latest block"
              mono
              loading={head.isPending}
              value={head.data ? `#${head.data.number.toLocaleString("en-US")}` : "—"}
              sub={
                head.data
                  ? `${Math.max(0, Math.round(Date.now() / 1000 - Number(head.data.timestamp)))} s ago`
                  : undefined
              }
            />
            <Stat
              label="Gas price"
              mono
              loading={head.isPending}
              value={head.data ? gwei(head.data.gasPrice) : "—"}
            />
          </dl>
          {head.isError && (
            <div className="mt-5">
              <Callout tone="danger" title="Couldn't reach the network through the active route">
                {(head.error as Error).message.split("\n")[0]}. Selfnode won't fall back to a direct
                connection.{" "}
                {settings.mode === "private" &&
                  `${anonNetworks[settings.anonNetwork].label} may still be connecting; it retries every 15 s.`}
              </Callout>
            </div>
          )}
          {c.state === "starting" && settings.mode === "private" && !head.isError && (
            <p className="mt-5 text-small text-muted">
              Connecting to {anonNetworks[settings.anonNetwork].label}. The first request through an
              anonymity network can take several seconds.
            </p>
          )}
        </Panel>

        <TrafficPanel />

        <Panel title="Wallet" className="lg:col-span-2">
          <EmptyState title="No wallet on this device yet">
            Create or import a wallet to see balances here. Keys are encrypted on this device and
            never leave it.
          </EmptyState>
        </Panel>

        <Panel title="Your node">
          <p className="text-small text-muted">
            Run a pruned Sepolia node with the desktop app, or point Selfnode at a node you already
            run in <TextLink to="/settings">Settings</TextLink>.
          </p>
        </Panel>
      </div>
    </Page>
  );
}

function TrafficPanel() {
  const { session } = useTraffic();
  const total = ROUTES.reduce((n, r) => n + session[r], 0);
  const share = total ? (session["anon-rpc"] / total) * 100 : null;
  return (
    <Panel title="Traffic this session">
      <p className="font-mono text-h1 tabular">
        {share === null ? "—" : `${share.toFixed(share === 100 ? 0 : 1)}%`}
      </p>
      <p className="text-small text-muted">of {total} requests went through Anon-RPC</p>
      <p className="mt-3 text-small">
        <TextLink to="/settings#traffic">See every route</TextLink>
      </p>
    </Panel>
  );
}

function Stat({
  label,
  value,
  sub,
  mono,
  loading,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  mono?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd
        className={
          mono ? "mt-1 truncate font-mono text-body tabular" : "mt-1 truncate text-body font-medium"
        }
      >
        {loading ? <Skeleton className="mt-1 h-4 w-24" /> : value}
      </dd>
      {sub && !loading && <dd className="text-caption text-muted">{sub}</dd>}
    </div>
  );
}

function gwei(wei: bigint): string {
  const f = formatAmount(wei, 9, 3);
  if (f.whole === "0" && !f.fraction && f.truncated) return "< 0.001 gwei";
  return `${f.whole}${f.fraction ? `.${f.fraction}` : ""} gwei`;
}
