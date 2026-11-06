/**
 * The desktop app's bridge (apps/desktop/src/preload.ts), if running inside it.
 * The website has no bridge; everything here must degrade to "not desktop".
 */
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

/** What a client says it's doing; a percentage only when the client printed one. */
export interface SyncStage {
  label: string;
  detail?: string;
  percent?: number;
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
    stage: SyncStage | null;
  };
  consensus: {
    running: boolean;
    syncing: boolean | null;
    headSlot: number | null;
    syncDistance: number | null;
    peers: number | null;
    stage: SyncStage | null;
  };
  etaSeconds: number | null;
  disk: { freeGB: number; totalGB: number } | null;
  dataDir: string;
  problems: NodeProblem[];
  updatedAt: number;
}

export interface NodeProblem {
  client: "nethermind" | "nimbus";
  kind: "unclean-shutdown" | "database";
  message: string;
}

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  severity: "fail" | "warn" | "info";
  detail: string;
}
export interface Preflight {
  platform: string;
  supported: boolean;
  canStart: boolean;
  dataDir: string;
  disk: { freeGB: number; totalGB: number };
  requirement: {
    network: "sepolia";
    requiredGB: number;
    marginGB: number;
    figures: {
      executionGB: number;
      consensusGB: number;
      growthGBPerWeek: number;
      growthWeeks: number;
    };
  };
  mainnet: { requiredGB: number; wouldFit: boolean };
  checks: PreflightCheck[];
}
export interface NodeSettings {
  dataDir: string;
  pauseOnBattery: boolean;
  checkpointUrl: string;
}
export interface NodeInfo {
  unsupported: string | null;
  manifest: {
    checkedAt: string;
    maintainerReviewed: boolean;
    clients: { nethermind: string; nimbus: string };
    checkpointSync: string[];
  };
}
export interface LogLine {
  source: "nethermind" | "nimbus" | "selfnode";
  line: string;
  at: number;
}

export interface DesktopBridge {
  isDesktop: true;
  version: number;
  node: {
    info(): Promise<NodeInfo>;
    preflight(): Promise<Preflight>;
    status(): Promise<NodeStatus>;
    settings(): Promise<NodeSettings>;
    start(): Promise<void>;
    stop(): Promise<void>;
    logs(source?: LogLine["source"]): Promise<LogLine[]>;
    setPauseOnBattery(v: boolean): Promise<NodeSettings>;
    setCheckpointUrl(url: string): Promise<NodeSettings>;
    chooseDataDir(): Promise<NodeSettings>;
    resync(client: "nethermind" | "nimbus"): Promise<{ deleted: boolean }>;
    onStatus(cb: (s: NodeStatus) => void): () => void;
  };
  vault: {
    available(): Promise<boolean>;
    wrap(text: string): Promise<string>;
    unwrap(b64: string): Promise<string>;
  };
}

export const desktop: DesktopBridge | null =
  typeof window !== "undefined"
    ? ((window as unknown as { selfnodeDesktop?: DesktopBridge }).selfnodeDesktop ?? null)
    : null;

/** The local node's JSON-RPC URL (bound to 127.0.0.1 by the node manager). */
export const LOCAL_NODE_RPC = "http://127.0.0.1:8545";
