/**
 * Runs a pruned Sepolia node: Nethermind (execution) + Nimbus (consensus).
 * Command lines and their documentation live in ./args.ts; process control
 * (including real Ctrl+C on Windows) in ./process.ts.
 *
 * Damage handling: a "running" marker is written per client at start and
 * removed only after a verified clean exit (exited after Ctrl+C/SIGINT without
 * being force-killed, and printed its own clean-shutdown line). If a marker is
 * found on the next start, or a client dies at startup with a database error,
 * the status says so and offers a resync from checkpoint. Data is deleted only
 * after the user confirms (see ipc.ts).
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CL_REST_PORT,
  CLEAN_EXIT_CODE,
  CLEAN_SHUTDOWN,
  DB_FAILURE,
  EL_RPC_PORT,
  NETHERMIND_DB_CORRUPTION_EXIT,
  nethermindArgs,
  nimbusArgs,
  nimbusCheckpointArgs,
} from "./args";
import { ensureInstalled, type Installed } from "./install";
import { currentPlatform, type ClientId, type Manifest } from "./manifest";
import { diskSpace, diskTooLow, preflight } from "./preflight";
import { startClient, type ManagedProcess } from "./process";
import {
  describeNethermind,
  describeNimbus,
  emptyNethermindView,
  readNethermindLine,
  type NethermindLogView,
  type NimbusSyncing,
  type SyncStage,
} from "./stage";

export const EL_RPC = `http://127.0.0.1:${EL_RPC_PORT}`;
const CL_REST = `http://127.0.0.1:${CL_REST_PORT}`;
const STOP_TIMEOUT_MS = 60_000;

export type NodeState =
  | "stopped"
  | "installing"
  | "checkpoint-sync"
  | "starting"
  | "syncing"
  | "synced"
  | "paused-battery"
  | "paused-low-disk"
  | "stopping"
  | "error";

export interface NodeProblem {
  client: ClientId;
  kind: "unclean-shutdown" | "database";
  message: string;
}

export interface NodeStatus {
  state: NodeState;
  message: string;
  execution: {
    running: boolean;
    syncing: boolean | null;
    currentBlock: number | null;
    highestBlock: number | null;
    peers: number | null;
    /** What Nethermind says it's doing (from its sync log lines and eth_syncing). */
    stage: SyncStage | null;
  };
  consensus: {
    running: boolean;
    syncing: boolean | null;
    headSlot: number | null;
    syncDistance: number | null;
    peers: number | null;
    /** What Nimbus says it's doing (from /eth/v1/node/syncing). */
    stage: SyncStage | null;
  };
  /** Seconds, from the measured block rate while catching up blocks; null otherwise (never guessed). */
  etaSeconds: number | null;
  disk: { freeGB: number; totalGB: number } | null;
  dataDir: string;
  /** Unclean previous stops or database failures, each with a resync option. */
  problems: NodeProblem[];
  updatedAt: number;
}

export interface NodeSettings {
  dataDir: string;
  pauseOnBattery: boolean;
  checkpointUrl: string;
}

/**
 * Synced only when both clients say so, the execution client has peers and a
 * head, AND that head is under 2 minutes old. So a node that reports "not
 * syncing" while still catching up can't trigger the switch to local reads.
 */
export function isSynced(
  ex: Pick<NodeStatus["execution"], "syncing" | "peers" | "currentBlock">,
  cs: Pick<NodeStatus["consensus"], "syncing">,
  headAgeSeconds: number | null,
): boolean {
  return (
    ex.syncing === false &&
    (ex.peers ?? 0) > 0 &&
    cs.syncing === false &&
    (ex.currentBlock ?? 0) > 0 &&
    headAgeSeconds !== null &&
    headAgeSeconds < 120
  );
}

type LogSource = ClientId | "selfnode";
type Log = { source: LogSource; line: string; at: number };

export class NodeManager {
  #procs = new Map<ClientId, ManagedProcess>();
  #cleanLine: Partial<Record<ClientId, boolean>> = {};
  #logs: Log[] = [];
  #poll: NodeJS.Timeout | null = null;
  #watchdog: NodeJS.Timeout | null = null;
  #samples: { t: number; block: number }[] = [];
  /** Nethermind's sync stage, as read from its own log lines (reset on each start). */
  #nmView: NethermindLogView = emptyNethermindView();
  #status: NodeStatus;
  #stopping = false;

  constructor(
    private readonly manifest: Manifest,
    private readonly binRoot: string,
    private settings: NodeSettings,
    private readonly emit: (s: NodeStatus) => void,
    private readonly alert: (title: string, body: string) => void,
  ) {
    this.#status = this.#blank("stopped", "Not running.");
    this.#status.problems = this.#uncleanMarkers();
  }

  get status(): NodeStatus {
    return this.#status;
  }
  get running(): boolean {
    return [...this.#procs.values()].some((p) => p.running);
  }
  logs(source?: LogSource): Log[] {
    return source ? this.#logs.filter((l) => l.source === source) : this.#logs;
  }
  updateSettings(s: NodeSettings): void {
    this.settings = s;
    if (!this.running) this.#set({ problems: this.#uncleanMarkers() });
  }

  #blank(state: NodeState, message: string): NodeStatus {
    return {
      state,
      message,
      execution: {
        running: false,
        syncing: null,
        currentBlock: null,
        highestBlock: null,
        peers: null,
        stage: null,
      },
      consensus: {
        running: false,
        syncing: null,
        headSlot: null,
        syncDistance: null,
        peers: null,
        stage: null,
      },
      etaSeconds: null,
      disk: null,
      dataDir: this.settings?.dataDir ?? "",
      problems: this.#status?.problems ?? [],
      updatedAt: Date.now(),
    };
  }

  #set(patch: Partial<NodeStatus>): void {
    this.#status = {
      ...this.#status,
      ...patch,
      dataDir: this.settings.dataDir,
      updatedAt: Date.now(),
    };
    this.emit(this.#status);
  }

  #log(source: LogSource, line: string): void {
    this.#logs.push({ source, line: line.slice(0, 2000), at: Date.now() });
    if (this.#logs.length > 3000) this.#logs.splice(0, this.#logs.length - 3000);
  }

  // ------------------------------------------------------------ markers

  #dirs() {
    const root = this.settings.dataDir;
    const d = {
      root,
      nethermind: join(root, "nethermind"),
      nimbus: join(root, "nimbus"),
      logs: join(root, "logs"),
    };
    // Nimbus's folder is NOT pre-created: Nimbus creates it with owner-only
    // permissions and refuses (on Windows: "Data folder has insecure ACL") a
    // folder that inherited broader access.
    for (const p of [d.root, d.nethermind, d.logs]) mkdirSync(p, { recursive: true });
    return d;
  }
  #marker(client: ClientId): string {
    return join(this.settings.dataDir, `.${client}.running`);
  }
  #uncleanMarkers(): NodeProblem[] {
    return (["nethermind", "nimbus"] as const)
      .filter((c) => existsSync(this.#marker(c)))
      .map((client) => ({
        client,
        kind: "unclean-shutdown" as const,
        message: `${client === "nethermind" ? "Nethermind" : "Nimbus"} didn't shut down cleanly last time. It usually recovers on start; if it won't start, resync it from checkpoint.`,
      }));
  }

  // ------------------------------------------------------------ start

  async start(): Promise<void> {
    if (this.running) return;
    this.#stopping = false;
    const platform = currentPlatform();
    if (!platform) throw new Error("No official client builds for this computer.");
    const pf = await preflight(this.manifest, this.settings.dataDir);
    if (!pf.canStart) {
      const failed = pf.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => c.detail);
      this.#set({ state: "error", message: `Pre-flight failed: ${failed.join(" ")}` });
      throw new Error(this.#status.message);
    }
    try {
      this.#set({
        state: "installing",
        message: "Checking client binaries…",
        problems: this.#uncleanMarkers(),
      });
      const progress = (m: string) => {
        this.#log("selfnode", m);
        this.#set({ message: m });
      };
      const el = await ensureInstalled(
        this.manifest,
        "nethermind",
        platform,
        this.binRoot,
        progress,
      );
      const cl = await ensureInstalled(this.manifest, "nimbus", platform, this.binRoot, progress);
      const dirs = this.#dirs();
      const jwt = this.#jwt(dirs.root);
      if (!existsSync(dirs.nimbus) || readdirSync(dirs.nimbus).length === 0) {
        rmSync(dirs.nimbus, { recursive: true, force: true }); // Nimbus creates it securely
        await this.#checkpointSync(cl, dirs.nimbus, dirs.logs);
      }
      this.#set({ state: "starting", message: "Starting Nethermind and Nimbus…" });
      this.#launch("nethermind", el, nethermindArgs(dirs.nethermind, jwt), dirs.logs);
      this.#launch("nimbus", cl, nimbusArgs(dirs.nimbus, jwt), dirs.logs);
      this.#set({ state: "syncing", message: "Syncing Sepolia." });
      this.#startTimers();
    } catch (e) {
      await this.stop("error");
      this.#set({ state: "error", message: (e as Error).message });
      throw e;
    }
  }

  /** A JWT secret generated locally, readable by the user only. */
  #jwt(root: string): string {
    const path = join(root, "jwt.hex");
    if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
    if (process.platform !== "win32") chmodSync(path, 0o600);
    return path;
  }

  async #checkpointSync(cl: Installed, dir: string, logs: string): Promise<void> {
    this.#log(
      "selfnode",
      `Checkpoint sync (no history backfill) from ${this.settings.checkpointUrl}`,
    );
    this.#set({
      state: "checkpoint-sync",
      message: `Checkpoint sync from ${new URL(this.settings.checkpointUrl).host}…`,
    });
    const p = startClient({
      name: "nimbus-checkpoint",
      binary: cl.binary,
      args: nimbusCheckpointArgs(dir, this.settings.checkpointUrl),
      cwd: cl.dir,
      logDir: logs,
      onLine: (l) => this.#log("nimbus", l),
      onNote: (n) => this.#log("selfnode", n),
    });
    const { code } = await p.exited;
    if (code !== 0) throw new Error(`Checkpoint sync failed (exit ${code}). See the Nimbus log.`);
    this.#log("selfnode", "Checkpoint sync complete.");
  }

  #launch(client: ClientId, inst: Installed, args: string[], logDir: string): void {
    if (client === "nethermind") this.#nmView = emptyNethermindView();
    this.#log("selfnode", `Starting ${client} ${inst.version}`);
    writeFileSync(this.#marker(client), new Date().toISOString());
    this.#cleanLine[client] = false;
    const started = Date.now();
    const recent: string[] = [];
    const p = startClient({
      name: client,
      binary: inst.binary,
      args,
      cwd: inst.dir,
      logDir,
      onLine: (l) => {
        this.#log(client, l);
        if (client === "nethermind") this.#nmView = readNethermindLine(this.#nmView, l);
        if (CLEAN_SHUTDOWN[client].test(l)) this.#cleanLine[client] = true;
        recent.push(l);
        if (recent.length > 200) recent.shift();
      },
      onNote: (n) => this.#log("selfnode", n),
    });
    this.#procs.set(client, p);
    void p.exited.then(({ code, signal }) => {
      this.#log("selfnode", `${client} exited (${signal ?? `exit ${code}`})`);
      if (this.#stopping) return;
      // Died on its own. A failure soon after start with a database error = likely damaged data.
      const dbError =
        (client === "nethermind" && code === NETHERMIND_DB_CORRUPTION_EXIT) ||
        (Date.now() - started < 180_000 && recent.some((l) => DB_FAILURE[client].test(l)));
      const name = client === "nethermind" ? "Nethermind" : "Nimbus";
      const problems: NodeProblem[] = dbError
        ? [
            {
              client,
              kind: "database",
              message: `${name} couldn't open its database. It may have been damaged by an unclean stop. Resync it from checkpoint to recover.`,
            },
          ]
        : this.#status.problems;
      void this.stop("error").then(() =>
        this.#set({
          state: "error",
          message: `${name} stopped unexpectedly (${signal ?? `exit ${code}`}). See its log.`,
          problems,
        }),
      );
    });
  }

  // ------------------------------------------------------------ status

  #startTimers(): void {
    this.#poll = setInterval(() => void this.#refresh(), 5000);
    this.#watchdog = setInterval(() => this.#checkDisk(), 30_000);
    void this.#refresh();
  }

  #checkDisk(): void {
    const d = diskSpace(this.settings.dataDir);
    this.#set({ disk: d });
    if (this.running && diskTooLow(d, this.manifest.disk)) {
      void this.stop("paused-low-disk").then(() => {
        const msg = `Paused: only ${d.freeGB.toFixed(0)} GB free on the node's drive (minimum 50 GB or 10%). Free some space, then resume.`;
        this.#set({ state: "paused-low-disk", message: msg });
        this.alert("Selfnode paused your node", msg);
      });
    }
  }

  async #rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const r = await fetch(EL_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(4000),
    });
    return ((await r.json()) as { result: T }).result;
  }

  async #rest<T>(path: string): Promise<T> {
    const r = await fetch(`${CL_REST}${path}`, { signal: AbortSignal.timeout(4000) });
    return ((await r.json()) as { data: T }).data;
  }

  async #refresh(): Promise<void> {
    const ex = { ...this.#status.execution, running: !!this.#procs.get("nethermind")?.running };
    const cs = { ...this.#status.consensus, running: !!this.#procs.get("nimbus")?.running };
    let headAgeSeconds: number | null = null;
    try {
      const [syncing, peers, block, head] = await Promise.all([
        this.#rpc<false | { currentBlock: string; highestBlock: string }>("eth_syncing"),
        this.#rpc<string>("net_peerCount"),
        this.#rpc<string>("eth_blockNumber"),
        this.#rpc<{ timestamp: string } | null>("eth_getBlockByNumber", ["latest", false]),
      ]);
      ex.peers = Number(peers);
      ex.syncing = syncing !== false;
      ex.currentBlock = syncing ? Number(syncing.currentBlock) : Number(block);
      ex.highestBlock = syncing ? Number(syncing.highestBlock) : Number(block);
      headAgeSeconds = head ? Math.round(Date.now() / 1000 - Number(head.timestamp)) : null;
    } catch {
      /* not answering yet */
    }
    try {
      const [s, p] = await Promise.all([
        this.#rest<NimbusSyncing & { head_slot: string }>("/eth/v1/node/syncing"),
        this.#rest<{ connected: string }>("/eth/v1/node/peer_count"),
      ]);
      cs.syncing = s.is_syncing;
      cs.headSlot = Number(s.head_slot);
      cs.syncDistance = Number(s.sync_distance);
      cs.peers = Number(p.connected);
      cs.stage = describeNimbus(s);
    } catch {
      /* not answering yet */
    }
    let eta: number | null = null;
    if (ex.currentBlock && ex.highestBlock && ex.syncing) {
      this.#samples.push({ t: Date.now(), block: ex.currentBlock });
      this.#samples = this.#samples.filter((s) => Date.now() - s.t < 300_000);
      const first = this.#samples[0];
      if (first && ex.currentBlock > first.block) {
        const rate = (ex.currentBlock - first.block) / ((Date.now() - first.t) / 1000);
        eta = Math.round((ex.highestBlock - ex.currentBlock) / rate);
      }
    }
    ex.stage = ex.running ? describeNethermind(this.#nmView, ex) : null;
    if (!cs.running) cs.stage = null;
    const synced = isSynced(ex, cs, headAgeSeconds);
    const busy = ["paused-battery", "paused-low-disk", "stopping", "error"].includes(
      this.#status.state,
    );
    this.#set({
      execution: ex,
      consensus: cs,
      etaSeconds: eta,
      ...(busy
        ? {}
        : {
            state: synced ? "synced" : "syncing",
            message: synced ? "Synced. Selfnode can read from your node." : "Syncing Sepolia.",
          }),
    });
  }

  // ------------------------------------------------------------ stop

  /**
   * Stop both clients gracefully: Ctrl+C (Windows) or SIGINT (macOS), up to
   * 60 s each, force-killing only after that. Consensus first, then execution.
   */
  async stop(reason: NodeState = "stopped"): Promise<void> {
    this.#stopping = true;
    if (this.#poll) clearInterval(this.#poll);
    if (this.#watchdog) clearInterval(this.#watchdog);
    this.#poll = this.#watchdog = null;
    if (!this.running) {
      if (reason === "stopped")
        this.#set({ ...this.#blank("stopped", "Not running."), problems: this.#uncleanMarkers() });
      return;
    }
    this.#set({
      state: "stopping",
      message: "Stopping the node cleanly (this can take up to a minute)…",
    });
    for (const client of ["nimbus", "nethermind"] as const) {
      const p = this.#procs.get(client);
      if (!p) continue;
      const r = await p.stop(STOP_TIMEOUT_MS);
      const clean =
        r.graceful && this.#cleanLine[client] === true && r.code === CLEAN_EXIT_CODE[client];
      this.#log(
        "selfnode",
        `${client} stopped ${clean ? "cleanly" : r.graceful ? "without its clean-shutdown message" : "by force after 60 s"} (exit ${r.code ?? r.signal ?? "?"}).`,
      );
      if (clean) rmSync(this.#marker(client), { force: true });
      this.#procs.delete(client);
    }
    const problems = this.#uncleanMarkers();
    this.#set({
      ...this.#blank(reason, reason === "stopped" ? "Stopped." : this.#status.message),
      disk: this.#status.disk,
      problems,
    });
  }

  /**
   * Delete one client's data so it resyncs from checkpoint on the next start.
   * Only called after the user confirmed in a native dialog (ipc.ts).
   */
  async resync(client: ClientId): Promise<void> {
    if (this.running) throw new Error("Stop the node before resyncing.");
    const dirs = this.#dirs();
    rmSync(dirs[client], { recursive: true, force: true });
    // Nimbus recreates its folder itself, with owner-only permissions.
    if (client === "nethermind") mkdirSync(dirs.nethermind, { recursive: true });
    rmSync(this.#marker(client), { force: true });
    this.#log(
      "selfnode",
      `${client} data deleted at the user's request; it will resync from checkpoint on the next start.`,
    );
    this.#set({
      problems: this.#uncleanMarkers(),
      message: `${client === "nethermind" ? "Nethermind" : "Nimbus"} will resync from checkpoint when you start the node.`,
    });
  }

  async onBattery(): Promise<void> {
    if (!this.settings.pauseOnBattery || !this.running) return;
    await this.stop("paused-battery");
    this.#set({
      state: "paused-battery",
      message: "Paused while on battery. It resumes when you plug in.",
    });
  }

  async onAc(): Promise<void> {
    if (this.#status.state === "paused-battery") await this.start();
  }
}
