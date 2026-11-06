import type { AnonNetworkId } from "../config/anon-rpc.js";
import type { ChainKey } from "../config/chains.js";

export type Mode = "private" | "verified" | "mynode";

export interface TransportSettings {
  mode: Mode;
  chain: ChainKey;
  anonNetwork: AnonNetworkId;
  /** Per-network worker config overrides (e.g. a Tor gateway). */
  anonConfig?: Partial<Record<AnonNetworkId, unknown>>;
  /** Overrides for the public RPC used per chain (still reached via Anon-RPC). */
  rpcUrl?: Partial<Record<ChainKey, string>>;
  /** My node mode: the user's own node RPC URL per chain. */
  myNodeUrl?: Partial<Record<ChainKey, string>>;
  /** Verified mode: user-supplied Helios upstreams per chain. */
  helios?: Partial<Record<ChainKey, { executionRpc: string; consensusRpc: string }>>;
  /**
   * Switch to the next anonymity network (never to direct) when the chosen one
   * fails. Default on; false turns it off.
   */
  anonFailover?: boolean;
  /** Allow the passthrough worker. Testing only: it does NOT anonymise. */
  allowInsecureReferenceWorker?: boolean;
}

/** Minimal surface of an Anon-RPC worker that the router depends on. */
export interface AnonWorkerLike {
  readonly ready: Promise<void>;
  fetch: typeof fetch;
  close(): void;
}

/** Minimal EIP-1193 provider surface (Helios, bootstrap providers). */
export interface Eip1193Like {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export type WorkerStatus =
  | { state: "idle" }
  | { state: "starting"; since: number }
  | { state: "ready"; readyMs: number }
  | { state: "failed"; error: string };
