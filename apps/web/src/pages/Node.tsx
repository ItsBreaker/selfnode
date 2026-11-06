/**
 * Node page. In the desktop app: the node manager (pre-flight, verified
 * install, Sepolia sync, logs). On the website: how to get the desktop app.
 */
import { useEffect, useState } from "react";
import { Page } from "../app/AppShell";
import {
  desktop,
  type LogLine,
  type NodeInfo,
  type NodeSettings,
  type NodeStatus,
  type Preflight,
} from "../desktop";
import { Badge, StatusDot, type Tone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Field } from "../ui/Field";
import { Panel } from "../ui/Panel";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { cx } from "../ui/cx";

export function Node() {
  return desktop ? <NodeManager /> : <DownloadPage />;
}

// ---------------------------------------------------------------- website

function DownloadPage() {
  return (
    <Page
      title="Run your own node"
      intro="The desktop app adds a node manager: it downloads, verifies and runs a pruned Sepolia node (Nethermind + Nimbus) on your computer."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Get the desktop app">
          <div className="flex flex-col gap-3 text-small">
            <p>
              Builds for macOS (Apple Silicon and Intel; the node manager needs Apple Silicon) and
              Windows x64. They're unsigned. The node manager is Sepolia-only, and experimental on
              Windows (stopping force-kills the clients, which may require a resync).
            </p>
            <p>
              <a
                className="font-medium underline underline-offset-2"
                href="https://github.com/ItsBreaker/selfnode/releases/tag/v0.1.0-hackathon"
                target="_blank"
                rel="noreferrer noopener"
              >
                Download v0.1.0-hackathon (pre-release)
              </a>{" "}
              for macOS (.dmg) or Windows (.exe), with{" "}
              <span className="font-mono">SHA256SUMS.txt</span>.
            </p>
            <p className="text-muted">Verify the download before opening it:</p>
            <pre className="overflow-x-auto rounded-sm bg-sunken p-3 font-mono text-caption">{`# macOS\nshasum -a 256 Selfnode-*.dmg\n# Windows (PowerShell)\nGet-FileHash .\\Selfnode-*.exe -Algorithm SHA256`}</pre>
          </div>
        </Panel>
        <Panel title="Opening an unsigned app">
          <div className="flex flex-col gap-3 text-small">
            <p>The builds aren't code-signed yet, so your OS will warn you the first time.</p>
            <p>
              <span className="font-medium">macOS:</span> open the .dmg, drag Selfnode to
              Applications, then right-click the app and choose{" "}
              <span className="font-medium">Open</span>, and confirm. (On recent macOS: System
              Settings → Privacy &amp; Security → Open Anyway.)
            </p>
            <p>
              <span className="font-medium">Windows:</span> when SmartScreen appears, choose{" "}
              <span className="font-medium">More info</span> →{" "}
              <span className="font-medium">Run anyway</span>.
            </p>
            <p className="text-muted">
              Only do this if the SHA-256 matches the one published alongside the build.
            </p>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- desktop

const STATE_TONE: Record<NodeStatus["state"], Tone> = {
  stopped: "neutral",
  installing: "mynode",
  "checkpoint-sync": "mynode",
  starting: "mynode",
  syncing: "warning",
  synced: "verified",
  "paused-battery": "neutral",
  "paused-low-disk": "danger",
  stopping: "neutral",
  error: "danger",
};
const STATE_LABEL: Record<NodeStatus["state"], string> = {
  stopped: "Stopped",
  installing: "Installing",
  "checkpoint-sync": "Checkpoint sync",
  starting: "Starting",
  syncing: "Syncing",
  synced: "Synced",
  "paused-battery": "Paused (battery)",
  "paused-low-disk": "Paused (low disk)",
  stopping: "Stopping",
  error: "Error",
};

const eta = (s: number | null) =>
  s === null
    ? "estimating…"
    : s < 3600
      ? `${Math.max(1, Math.round(s / 60))} min`
      : `${(s / 3600).toFixed(1)} h`;

function NodeManager() {
  const bridge = desktop;
  const [info, setInfo] = useState<NodeInfo | null>(null);
  const [pf, setPf] = useState<Preflight | null>(null);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [settings, setSettings] = useState<NodeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!bridge) return;
    const [i, p, s, st] = await Promise.all([
      bridge.node.info(),
      bridge.node.preflight(),
      bridge.node.settings(),
      bridge.node.status(),
    ]);
    setInfo(i);
    setPf(p);
    setSettings(s);
    setStatus(st);
  };
  useEffect(() => {
    void refresh();
    return bridge?.node.onStatus(setStatus);
  }, []);

  if (!bridge) return null;
  const running =
    !!status && !["stopped", "error", "paused-battery", "paused-low-disk"].includes(status.state);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(
        (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Your node"
      intro="A pruned Sepolia node on this computer: Nethermind (execution) and Nimbus (consensus), both minority clients, which helps client diversity."
      actions={
        status ? (
          <span className="inline-flex items-center gap-2 text-small">
            <StatusDot
              tone={STATE_TONE[status.state]}
              pulsing={running && status.state !== "synced"}
            />
            {STATE_LABEL[status.state]}
          </span>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        {info?.unsupported && (
          <Callout tone="warning" title="Node manager not supported on this computer">
            {info.unsupported}
          </Callout>
        )}
        {pf?.platform.startsWith("win32") && (
          <Callout tone="warning" title="Experimental on Windows">
            Windows gives Selfnode no way to send these clients a clean shutdown signal, so stopping
            the node force-kills them. Selfnode pauses Nethermind's block processing first, but
            Nimbus, or a first sync that's still in progress, can be interrupted mid-write. If a
            client won't start afterwards, the node may need to resync.
          </Callout>
        )}
        {error && (
          <Callout tone="danger" title="Couldn't complete that">
            {error}
          </Callout>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Status">
            {!status ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-small">{status.message}</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-small">
                  <div>
                    <dt className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
                      Nethermind
                    </dt>
                    <dd className="font-mono tabular">
                      {status.execution.currentBlock !== null
                        ? `#${status.execution.currentBlock.toLocaleString("en-US")}`
                        : "—"}
                      {status.execution.highestBlock && status.execution.syncing
                        ? ` / ${status.execution.highestBlock.toLocaleString("en-US")}`
                        : ""}
                    </dd>
                    <dd className="text-caption text-muted">
                      {status.execution.peers ?? "—"} peers
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
                      Nimbus
                    </dt>
                    <dd className="font-mono tabular">
                      {status.consensus.headSlot !== null
                        ? `slot ${status.consensus.headSlot.toLocaleString("en-US")}`
                        : "—"}
                    </dd>
                    <dd className="text-caption text-muted">
                      {status.consensus.peers ?? "—"} peers
                      {status.consensus.syncDistance
                        ? ` · ${status.consensus.syncDistance} slots behind`
                        : ""}
                    </dd>
                  </div>
                  {status.state === "syncing" && (
                    <div className="col-span-2">
                      <dt className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
                        Time to sync (estimate)
                      </dt>
                      <dd>{eta(status.etaSeconds)}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-3">
                  {running ? (
                    <Button
                      busy={busy || status.state === "stopping"}
                      onClick={() => void act(() => bridge.node.stop())}
                    >
                      Stop node
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      busy={busy}
                      disabled={!pf?.canStart}
                      onClick={() => void act(() => bridge.node.start())}
                    >
                      {status.state === "paused-low-disk" || status.state === "paused-battery"
                        ? "Resume node"
                        : "Start node"}
                    </Button>
                  )}
                </div>
                <p className="text-caption text-muted">
                  Once synced, Selfnode switches to reading from this node. Transactions are still
                  broadcast through the anonymity network, because broadcasting from your node would
                  reveal your IP to its peers.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Pre-flight">
            {!pf ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2.5">
                  {pf.checks.map((c) => (
                    <li key={c.id} className="flex gap-3 text-small">
                      <Badge
                        tone={
                          c.ok
                            ? "verified"
                            : c.severity === "fail"
                              ? "danger"
                              : c.severity === "warn"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {c.ok
                          ? "OK"
                          : c.severity === "fail"
                            ? "Blocks start"
                            : c.severity === "warn"
                              ? "Warning"
                              : "Unknown"}
                      </Badge>
                      <span>
                        <span className="font-medium">{c.label}.</span>{" "}
                        <span className="text-muted">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-muted">
                  Figures from Nethermind's measured database sizes (state, headers and code;
                  historical bodies and receipts aren't downloaded) and Nimbus's hardware guide.
                  Mainnet would need about {pf.mainnet.requiredGB} GB;{" "}
                  {pf.mainnet.wouldFit
                    ? "that would fit on this drive"
                    : "that wouldn't fit on this drive"}
                  . This build runs Sepolia only.
                </p>
              </div>
            )}
          </Panel>
        </div>

        {settings && (
          <Panel title="Settings">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium">Data directory</span>
                <p className="break-all font-mono text-caption text-muted">{settings.dataDir}</p>
                <div>
                  <Button
                    size="sm"
                    disabled={running}
                    onClick={() => void act(() => bridge.node.chooseDataDir())}
                  >
                    Choose another folder (e.g. an external SSD)
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium">On battery</span>
                <Segmented<string>
                  label="Pause the node on battery"
                  value={settings.pauseOnBattery ? "pause" : "keep"}
                  onChange={(v) => void act(() => bridge.node.setPauseOnBattery(v === "pause"))}
                  options={[
                    { value: "pause", label: "Pause on battery" },
                    { value: "keep", label: "Keep running" },
                  ]}
                />
              </div>
              <CheckpointField
                settings={settings}
                onSave={(u) => void act(() => bridge.node.setCheckpointUrl(u))}
              />
            </div>
          </Panel>
        )}

        <Logs />
        {info && (
          <p className="text-caption text-muted">
            Binaries: Nethermind {info.manifest.clients.nethermind} and Nimbus{" "}
            {info.manifest.clients.nimbus}, downloaded only from their official GitHub releases and
            checked against SHA-256 (and Nimbus's published SHA-512) before they run. Manifest
            checked {info.manifest.checkedAt}
            {info.manifest.maintainerReviewed
              ? ", reviewed by the maintainer"
              : ", pending maintainer review"}
            . RPC, Engine API and REST ports listen on 127.0.0.1 only.
          </p>
        )}
      </div>
    </Page>
  );
}

function CheckpointField({
  settings,
  onSave,
}: {
  settings: NodeSettings;
  onSave: (url: string) => void;
}) {
  const [v, setV] = useState(settings.checkpointUrl);
  const bad = !/^https:\/\/[^\s/]+/.test(v);
  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <Field
        label="Checkpoint sync URL (used once, for the first sync)"
        mono
        value={v}
        onChange={(e) => setV(e.target.value)}
        error={v && bad ? "Use an https:// URL" : undefined}
        hint="A beacon node you trust to provide a recent finalized state. Listed endpoints: github.com/eth-clients/checkpoint-sync-endpoints."
      />
      <div>
        <Button size="sm" disabled={bad || v === settings.checkpointUrl} onClick={() => onSave(v)}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Logs() {
  const [source, setSource] = useState<LogLine["source"]>("selfnode");
  const [lines, setLines] = useState<LogLine[]>([]);
  useEffect(() => {
    if (!desktop) return;
    let stop = false;
    const tick = async () => {
      const l = await desktop?.node.logs(source);
      if (!stop && l) setLines(l.slice(-200));
    };
    void tick();
    const t = setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [source]);
  return (
    <Panel
      title="Logs"
      actions={
        <Segmented<LogLine["source"]>
          label="Log source"
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: "selfnode", label: "Selfnode" },
            { value: "nethermind", label: "Nethermind" },
            { value: "nimbus", label: "Nimbus" },
          ]}
        />
      }
      flush
    >
      <pre
        className={cx(
          "h-72 overflow-auto px-5 py-3 font-mono text-caption leading-relaxed",
          !lines.length && "text-muted",
        )}
      >
        {lines.length ? lines.map((l) => l.line).join("\n") : "No output yet."}
      </pre>
    </Panel>
  );
}
