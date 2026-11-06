/**
 * One long-lived Anon-RPC worker per anonymity network (the worker can reach
 * any chain: the chain is chosen by the RPC URL we pass to its fetch).
 */
import { toFunctionSelector } from "viem";
import { anonNetworks, type AnonNetworkId } from "../config/anon-rpc.js";
import { publicRpc, type ChainKey } from "../config/chains.js";
import { InsecureWorkerError } from "./errors.js";
import { countRpcCalls, type Route, type TrafficCounter } from "./traffic.js";
import type { AnonWorkerLike, Eip1193Like, WorkerStatus } from "./types.js";

export interface WorkerInit {
  address: `0x${string}`;
  config: unknown;
  rpcProvider: Eip1193Like;
}
export type WorkerFactory = (init: WorkerInit) => AnonWorkerLike | Promise<AnonWorkerLike>;

/**
 * The official browser harness, loaded only when first needed. Pass `iframeUrl`
 * (a same-origin page that loads the harness's iframe-boot.js) so a strict CSP
 * without 'unsafe-inline' works; without it the harness uses an inline srcdoc.
 */
export function createHarnessWorkerFactory(opts: { iframeUrl?: string } = {}): WorkerFactory {
  return async ({ address, config, rpcProvider }) => {
    const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
    return new AnonRpcWorker({
      address,
      config,
      preExisting: { rpcProvider },
      ...(opts.iframeUrl ? { iframeUrl: opts.iframeUrl } : {}),
    } as ConstructorParameters<typeof AnonRpcWorker>[0]);
  };
}

/** Default factory: inline srcdoc bootstrap (fine without a strict CSP, e.g. in spikes). */
export const harnessWorkerFactory: WorkerFactory = createHarnessWorkerFactory();

/** The specifier's `workerHash()` call: its result is the keccak-256 the worker bundle must match. */
export const WORKER_HASH_SELECTOR = toFunctionSelector("workerHash()");

/** Remembers each network's worker code hash after a successful boot (trust on first use). */
export interface WorkerPinStore {
  get(id: AnonNetworkId): string | null;
  set(id: AnonNetworkId, workerHash: string): void;
}

export interface WorkerCodeChange {
  network: AnonNetworkId;
  label: string;
  previous: string;
  current: string;
}

export class WorkerCodeChangedError extends Error {
  override readonly name = "WorkerCodeChangedError";
  constructor(readonly change: WorkerCodeChange) {
    super(
      `${change.label}'s code changed since you last used it (worker hash ${change.previous.slice(0, 10)}… → ${change.current.slice(0, 10)}…) and wasn't accepted`,
    );
  }
}

export interface BootstrapOptions {
  pins?: WorkerPinStore;
  /**
   * Asked when a network's worker hash differs from the pinned one. Resolve
   * true to accept the new code. Without it, a change is always refused.
   */
  onCodeChange?: (change: WorkerCodeChange) => Promise<boolean>;
  /**
   * Where to do the specifier read for `chain`: the user's own node if one is
   * configured (My node mode), otherwise null for the public bootstrap RPC.
   */
  nodeFor?: (chain: ChainKey) => string | null;
}

/**
 * The bootstrap provider: a DIRECT, non-anonymised EIP-1193 shim used once per
 * worker to read the specifier contract. Every call is counted as "bootstrap".
 */
export function bootstrapProvider(
  url: string,
  counter: TrafficCounter,
  fetchImpl: typeof fetch = fetch,
  route: Route = "bootstrap",
  inspect?: (method: string, params: unknown, result: unknown) => Promise<void>,
): Eip1193Like {
  let id = 0;
  return {
    async request({ method, params }) {
      const body = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] });
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
      } catch (e) {
        counter.addFailed(countRpcCalls(body));
        throw e;
      }
      counter.add(route, countRpcCalls(body)); // sent and answered
      const json = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(`bootstrap ${method}: ${json.error.message}`);
      // Lets the pool check the worker hash before the harness acts on it.
      if (inspect) await inspect(method, params, json.result);
      return json.result;
    },
  };
}

interface Entry {
  worker: Promise<AnonWorkerLike>;
  status: WorkerStatus;
  /** Exponential moving average of request latency, ms. */
  latencyMs: number | null;
}

export class AnonWorkerPool {
  #entries = new Map<AnonNetworkId, Entry>();
  #listeners = new Set<() => void>();

  constructor(
    private readonly counter: TrafficCounter,
    private readonly factory: WorkerFactory = harnessWorkerFactory,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
    private readonly bootstrap: BootstrapOptions = {},
  ) {}

  /** A fetch routed through the given network's worker, timed for the status display. */
  fetchFor(
    id: AnonNetworkId,
    opts: { config?: unknown; allowInsecure?: boolean } = {},
  ): typeof fetch {
    const net = anonNetworks[id];
    if (net.kind !== "network" && !opts.allowInsecure) {
      throw new InsecureWorkerError(
        `${net.label} does not anonymise and was not explicitly allowed`,
      );
    }
    const entry = this.#ensure(id, opts.config);
    return async (input, init) => {
      const worker = await entry.worker;
      const t0 = Date.now();
      const res = await worker.fetch(input, init);
      const dt = Date.now() - t0;
      entry.latencyMs =
        entry.latencyMs === null ? dt : Math.round(entry.latencyMs * 0.7 + dt * 0.3);
      this.#emit();
      return res;
    };
  }

  status(id: AnonNetworkId): { status: WorkerStatus; latencyMs: number | null } {
    const e = this.#entries.get(id);
    return e
      ? { status: e.status, latencyMs: e.latencyMs }
      : { status: { state: "idle" }, latencyMs: null };
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Tear down one worker (e.g. after its config changed) or all of them. */
  close(id?: AnonNetworkId): void {
    for (const [key, e] of this.#entries) {
      if (id && key !== id) continue;
      void e.worker.then((w) => w.close()).catch(() => undefined);
      this.#entries.delete(key);
    }
    this.#emit();
  }

  #ensure(id: AnonNetworkId, config: unknown): Entry {
    const existing = this.#entries.get(id);
    if (existing) return existing;
    const net = anonNetworks[id];
    const started = Date.now();
    const entry: Entry = {
      status: { state: "starting", since: started },
      latencyMs: null,
      worker: null as never,
    };
    // The specifier read goes to the user's own node when there is one for that
    // chain (it learns nothing new); otherwise to the disclosed public bootstrap RPC.
    const nodeUrl = this.bootstrap.nodeFor?.(net.specifierChain) ?? null;
    let seenHash: string | null = null;
    const inspect = async (method: string, params: unknown, result: unknown) => {
      const call = Array.isArray(params) ? (params[0] as { data?: string } | undefined) : undefined;
      if (method !== "eth_call" || !call?.data?.toLowerCase().startsWith(WORKER_HASH_SELECTOR))
        return;
      if (typeof result !== "string" || result.length < 66) return; // the harness rejects it anyway
      const current = `0x${result.slice(2, 66).toLowerCase()}`;
      seenHash = current;
      const previous = this.bootstrap.pins?.get(id) ?? null;
      if (!previous || previous === current) return;
      // The code changed: never accept silently.
      const change: WorkerCodeChange = { network: id, label: net.label, previous, current };
      const ok = this.bootstrap.onCodeChange
        ? await this.bootstrap.onCodeChange(change).catch(() => false)
        : false;
      if (!ok) throw new WorkerCodeChangedError(change);
    };
    // .then(): a factory that throws synchronously still becomes a failed boot, not an exception here.
    entry.worker = Promise.resolve().then(() =>
      this.factory({
        address: net.specifier,
        config: config ?? net.defaultConfig,
        rpcProvider: bootstrapProvider(
          nodeUrl ?? publicRpc(net.specifierChain),
          this.counter,
          this.fetchImpl,
          nodeUrl ? "my-node" : "bootstrap",
          inspect,
        ),
      }),
    );
    entry.worker
      .then((w) => w.ready)
      .then(
        () => {
          entry.status = { state: "ready", readyMs: Date.now() - started };
          // Pin the hash only once the worker actually booted with it.
          if (seenHash) this.bootstrap.pins?.set(id, seenHash);
          this.#emit();
        },
        (e: unknown) => {
          entry.status = { state: "failed", error: e instanceof Error ? e.message : String(e) };
          this.#emit();
        },
      );
    this.#entries.set(id, entry);
    this.#emit();
    return entry;
  }

  #emit(): void {
    for (const l of this.#listeners) l();
  }
}
