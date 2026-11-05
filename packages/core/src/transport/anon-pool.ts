/**
 * One long-lived Anon-RPC worker per anonymity network (the worker can reach
 * any chain: the chain is chosen by the RPC URL we pass to its fetch).
 */
import { anonNetworks, type AnonNetworkId } from "../config/anon-rpc.js";
import { publicRpc } from "../config/chains.js";
import { InsecureWorkerError } from "./errors.js";
import { countRpcCalls, type TrafficCounter } from "./traffic.js";
import type { AnonWorkerLike, Eip1193Like, WorkerStatus } from "./types.js";

export interface WorkerInit {
  address: `0x${string}`;
  config: unknown;
  rpcProvider: Eip1193Like;
}
export type WorkerFactory = (init: WorkerInit) => AnonWorkerLike | Promise<AnonWorkerLike>;

/** Default factory: the official browser harness, loaded only when first needed. */
export const harnessWorkerFactory: WorkerFactory = async ({ address, config, rpcProvider }) => {
  const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
  return new AnonRpcWorker({
    address,
    config,
    preExisting: { rpcProvider },
  } as ConstructorParameters<typeof AnonRpcWorker>[0]);
};

/**
 * The bootstrap provider: a DIRECT, non-anonymised EIP-1193 shim used once per
 * worker to read the specifier contract. Every call is counted as "bootstrap".
 */
export function bootstrapProvider(
  url: string,
  counter: TrafficCounter,
  fetchImpl: typeof fetch = fetch,
): Eip1193Like {
  let id = 0;
  return {
    async request({ method, params }) {
      const body = JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] });
      counter.add("bootstrap", countRpcCalls(body));
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const json = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(`bootstrap ${method}: ${json.error.message}`);
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
    entry.worker = Promise.resolve(
      this.factory({
        address: net.specifier,
        config: config ?? net.defaultConfig,
        rpcProvider: bootstrapProvider(publicRpc(net.specifierChain), this.counter, this.fetchImpl),
      }),
    );
    entry.worker
      .then((w) => w.ready)
      .then(
        () => {
          entry.status = { state: "ready", readyMs: Date.now() - started };
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
