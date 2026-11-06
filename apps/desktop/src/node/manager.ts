/**
 * Runs a pruned Sepolia node: Nethermind (execution) + Nimbus (consensus).
 *
 * Disk-minimising configuration (each flag from the clients' docs):
 * - Nethermind (https://docs.nethermind.io/fundamentals/configuration):
 *   --config sepolia                            snap sync preset for Sepolia
 *   --Sync.DownloadBodiesInFastSync false       no historical block bodies
 *   --Sync.DownloadReceiptsInFastSync false     no historical receipts
 *     (history-pruning docs: a fresh sync otherwise keeps bodies/receipts from the
 *      ancient barrier on; database docs: those are 680 of Sepolia's 893 GB)
 *   --History.Pruning Rolling                   prune blocks/receipts older than
 *                                               History.RetentionEpochs (default and
 *                                               minimum 82125 epochs) as the head moves
 *   --Pruning.Mode Hybrid                       in-memory + full state pruning (default)
 *   --Pruning.FullPruningTrigger VolumeFreeSpace  full-prune automatically when free
 *                                               space drops below FullPruningThresholdMb
 *                                               (default 256000), as the state-pruning
 *                                               docs recommend leaving ≥250 GB for it
 * - Nimbus (https://nimbus.guide):
 *   trustedNodeSync --backfill=false            checkpoint sync, no block-history backfill
 *   --history=prune                             keep only the required ~5 months (default)
 *
 * All RPC/Engine/REST ports bind to 127.0.0.1. Only P2P ports are public.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureInstalled, type Installed } from "./install";
import { currentPlatform, type Manifest } from "./manifest";
import { diskSpace, diskTooLow, preflight } from "./preflight";

export const EL_RPC = "http://127.0.0.1:8545";
const ENGINE_PORT = 8551;
const CL_REST = "http://127.0.0.1:5052";

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

export interface NodeStatus {
  state: NodeState;
  message: string;
  execution: {
    running: boolean;
    syncing: boolean | null;
    currentBlock: number | null;
    highestBlock: number | null;
    peers: number | null;
  };
  consensus: {
    running: boolean;
    syncing: boolean | null;
    headSlot: number | null;
    syncDistance: number | null;
    peers: number | null;
  };
  /** Seconds, from the recent execution sync rate; null when unknown. */
  etaSeconds: number | null;
  disk: { freeGB: number; totalGB: number } | null;
  dataDir: string;
  updatedAt: number;
}

export interface NodeSettings {
  dataDir: string;
  pauseOnBattery: boolean;
  checkpointUrl: string;
}

type Log = { source: "nethermind" | "nimbus" | "selfnode"; line: string; at: number };

export class NodeManager {
  #el: ChildProcess | null = null;
  #cl: ChildProcess | null = null;
  #logs: Log[] = [];
  #poll: NodeJS.Timeout | null = null;
  #watchdog: NodeJS.Timeout | null = null;
  #samples: { t: number; block: number }[] = [];
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
  }

  get status(): NodeStatus {
    return this.#status;
  }
  get running(): boolean {
    return this.#el !== null || this.#cl !== null;
  }
  logs(source?: Log["source"]): Log[] {
    return source ? this.#logs.filter((l) => l.source === source) : this.#logs;
  }
  updateSettings(s: NodeSettings): void {
    this.settings = s;
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
      },
      consensus: { running: false, syncing: null, headSlot: null, syncDistance: null, peers: null },
      etaSeconds: null,
      disk: null,
      dataDir: this.settings?.dataDir ?? "",
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

  #log(source: Log["source"], text: string): void {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.#logs.push({ source, line: line.slice(0, 2000), at: Date.now() });
    }
    if (this.#logs.length > 3000) this.#logs.splice(0, this.#logs.length - 3000);
  }

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
      this.#set({ state: "installing", message: "Checking client binaries…" });
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
      if (!existsSync(dirs.cl) || readdirSync(dirs.cl).length === 0)
        await this.#checkpointSync(cl, dirs.cl);
      this.#set({ state: "starting", message: "Starting Nethermind and Nimbus…" });
      this.#el = this.#spawn("nethermind", el, [
        "--config",
        "sepolia",
        "--data-dir",
        dirs.el,
        "--Sync.DownloadBodiesInFastSync",
        "false",
        "--Sync.DownloadReceiptsInFastSync",
        "false",
        "--History.Pruning",
        "Rolling",
        "--Pruning.Mode",
        "Hybrid",
        "--Pruning.FullPruningTrigger",
        "VolumeFreeSpace",
        "--JsonRpc.Enabled",
        "true",
        "--JsonRpc.Host",
        "127.0.0.1",
        "--JsonRpc.Port",
        "8545",
        "--JsonRpc.EngineHost",
        "127.0.0.1",
        "--JsonRpc.EnginePort",
        String(ENGINE_PORT),
        "--JsonRpc.JwtSecretFile",
        jwt,
        "--JsonRpc.EnabledModules",
        "[Eth,Net,Web3,Health,Proof]",
        "--Init.WebSocketsEnabled",
        "false",
        "--HealthChecks.Enabled",
        "false",
        "--Metrics.Enabled",
        "false",
      ]);
      this.#cl = this.#spawn("nimbus", cl, [
        "--network=sepolia",
        `--data-dir=${dirs.cl}`,
        `--el=http://127.0.0.1:${ENGINE_PORT}`,
        `--jwt-secret=${jwt}`,
        "--history=prune",
        "--rest",
        "--rest-address=127.0.0.1",
        "--rest-port=5052",
        "--metrics=false",
        "--non-interactive",
      ]);
      this.#set({ state: "syncing", message: "Syncing Sepolia." });
      this.#startTimers();
    } catch (e) {
      await this.stop("error");
      this.#set({ state: "error", message: (e as Error).message });
      throw e;
    }
  }

  #dirs() {
    const root = this.settings.dataDir;
    const d = { root, el: join(root, "nethermind"), cl: join(root, "nimbus") };
    for (const p of Object.values(d)) mkdirSync(p, { recursive: true });
    return d;
  }

  /** A JWT secret generated locally, readable by the user only. */
  #jwt(root: string): string {
    const path = join(root, "jwt.hex");
    if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
    if (process.platform !== "win32") chmodSync(path, 0o600);
    return path;
  }

  async #checkpointSync(cl: Installed, dir: string): Promise<void> {
    this.#log(
      "selfnode",
      `Checkpoint sync (no history backfill) from ${this.settings.checkpointUrl}`,
    );
    this.#set({
      state: "checkpoint-sync",
      message: `Checkpoint sync from ${new URL(this.settings.checkpointUrl).host}…`,
    });
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        cl.binary,
        [
          "trustedNodeSync",
          "--network=sepolia",
          `--data-dir=${dir}`,
          `--trusted-node-url=${this.settings.checkpointUrl}`,
          "--backfill=false",
        ],
        { cwd: cl.dir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
      );
      p.stdout?.on("data", (b: Buffer) => this.#log("nimbus", b.toString()));
      p.stderr?.on("data", (b: Buffer) => this.#log("nimbus", b.toString()));
      p.on("error", reject);
      p.on("exit", (code) => {
        if (code === 0) this.#log("selfnode", "Checkpoint sync complete.");
      });
      p.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Checkpoint sync failed (exit ${code}). See the Nimbus log.`)),
      );
    });
  }

  #spawn(source: "nethermind" | "nimbus", inst: Installed, args: string[]): ChildProcess {
    this.#log("selfnode", `Starting ${source} ${inst.version}`);
    const p = spawn(inst.binary, args, {
      cwd: inst.dir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    p.stdout?.on("data", (b: Buffer) => this.#log(source, b.toString()));
    p.stderr?.on("data", (b: Buffer) => this.#log(source, b.toString()));
    p.on("exit", (code, signal) => {
      this.#log("selfnode", `${source} exited (${signal ?? code})`);
      if (source === "nethermind") this.#el = null;
      else this.#cl = null;
      if (!this.#stopping) {
        void this.stop("error");
        this.#set({
          state: "error",
          message: `${source} stopped unexpectedly (${signal ?? `exit ${code}`}). See its log.`,
        });
      }
    });
    return p;
  }

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

  async #rpc<T>(method: string): Promise<T> {
    const r = await fetch(EL_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    return ((await r.json()) as { result: T }).result;
  }

  async #rest<T>(path: string): Promise<T> {
    const r = await fetch(`${CL_REST}${path}`, { signal: AbortSignal.timeout(4000) });
    return ((await r.json()) as { data: T }).data;
  }

  async #refresh(): Promise<void> {
    const ex = { ...this.#status.execution, running: this.#el !== null };
    const cs = { ...this.#status.consensus, running: this.#cl !== null };
    try {
      const [syncing, peers, block] = await Promise.all([
        this.#rpc<false | { currentBlock: string; highestBlock: string }>("eth_syncing"),
        this.#rpc<string>("net_peerCount"),
        this.#rpc<string>("eth_blockNumber"),
      ]);
      ex.peers = Number(peers);
      ex.syncing = syncing !== false;
      ex.currentBlock = syncing ? Number(syncing.currentBlock) : Number(block);
      ex.highestBlock = syncing ? Number(syncing.highestBlock) : Number(block);
    } catch {
      /* not answering yet */
    }
    try {
      const [s, p] = await Promise.all([
        this.#rest<{ head_slot: string; sync_distance: string; is_syncing: boolean }>(
          "/eth/v1/node/syncing",
        ),
        this.#rest<{ connected: string }>("/eth/v1/node/peer_count"),
      ]);
      cs.syncing = s.is_syncing;
      cs.headSlot = Number(s.head_slot);
      cs.syncDistance = Number(s.sync_distance);
      cs.peers = Number(p.connected);
    } catch {
      /* not answering yet */
    }
    // ETA from the execution layer's recent rate (blocks/second over ~5 minutes).
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
    const synced =
      ex.syncing === false &&
      (ex.peers ?? 0) > 0 &&
      cs.syncing === false &&
      (ex.currentBlock ?? 0) > 0;
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

  /** Stop both clients cleanly (SIGINT, then SIGKILL after 60 s). */
  async stop(reason: NodeState = "stopped"): Promise<void> {
    this.#stopping = true;
    if (this.#poll) clearInterval(this.#poll);
    if (this.#watchdog) clearInterval(this.#watchdog);
    this.#poll = this.#watchdog = null;
    if (!this.running) {
      if (reason === "stopped") this.#set(this.#blank("stopped", "Not running."));
      return;
    }
    this.#set({ state: "stopping", message: "Stopping the node cleanly…" });
    const stopOne = (p: ChildProcess | null) =>
      new Promise<void>((resolve) => {
        if (!p || p.exitCode !== null) return resolve();
        const kill = setTimeout(() => p.kill("SIGKILL"), 60_000);
        p.once("exit", () => {
          clearTimeout(kill);
          resolve();
        });
        p.kill("SIGINT");
      });
    // Consensus first (it drives the execution client), then execution.
    await stopOne(this.#cl);
    await stopOne(this.#el);
    this.#el = this.#cl = null;
    this.#set({
      ...this.#blank(reason, reason === "stopped" ? "Stopped." : this.#status.message),
      disk: this.#status.disk,
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
