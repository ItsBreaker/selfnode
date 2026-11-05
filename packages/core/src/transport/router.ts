/**
 * The one transport layer. Wallet, explorer and swap all get their viem
 * transport from here. It knows the active mode, counts every call by route,
 * and NEVER falls back silently: if the active route fails, the error surfaces.
 *
 * Broadcast rule: `eth_sendRawTransaction` always goes through Anon-RPC, in
 * every mode (a node or Helios upstream broadcasting directly reveals the
 * sender's IP). A direct broadcast needs `directOnce({ userConfirmed: true })`.
 */
import { createTransport, custom, http, type EIP1193RequestFn, type Transport } from "viem";
import { anonNetworks } from "../config/anon-rpc.js";
import { publicRpc, type ChainKey } from "../config/chains.js";
import { heliosUpstreams } from "../config/helios.js";
import { AnonWorkerPool, type WorkerFactory } from "./anon-pool.js";
import { TransportUnavailableError } from "./errors.js";
import { heliosProviderFactory, type HeliosFactory } from "./helios.js";
import { HealthTracker, trackedFetch } from "./health.js";
import { countingFetch, TrafficCounter } from "./traffic.js";
import type { Eip1193Like, TransportSettings } from "./types.js";

/** Anonymity networks are slow to start; Nym's first call took 13 s in Phase 0. */
export const ANON_TIMEOUT_MS = 45_000;

export interface RouterDeps {
  counter?: TrafficCounter;
  workerFactory?: WorkerFactory;
  heliosFactory?: HeliosFactory;
  fetch?: typeof fetch;
}

export class TransportRouter {
  readonly counter: TrafficCounter;
  readonly pool: AnonWorkerPool;
  /** Health of the active mode's main route (reset when the route changes). */
  readonly health = new HealthTracker();
  #settings: TransportSettings;
  #helios = new Map<string, Promise<Eip1193Like>>();
  #heliosFactory: HeliosFactory;
  #fetch: typeof fetch;

  constructor(settings: TransportSettings, deps: RouterDeps = {}) {
    this.counter = deps.counter ?? new TrafficCounter();
    this.#fetch = deps.fetch ?? ((...a) => fetch(...a));
    this.pool = new AnonWorkerPool(this.counter, deps.workerFactory, this.#fetch);
    this.#heliosFactory = deps.heliosFactory ?? heliosProviderFactory(this.counter, this.#fetch);
    this.#settings = settings;
  }

  get settings(): TransportSettings {
    return this.#settings;
  }

  update(next: TransportSettings): void {
    const prev = this.#settings;
    // A changed worker config (e.g. new Tor gateway) needs a fresh worker.
    for (const id of Object.keys(anonNetworks) as (keyof typeof anonNetworks)[]) {
      if (JSON.stringify(prev.anonConfig?.[id]) !== JSON.stringify(next.anonConfig?.[id]))
        this.pool.close(id);
    }
    if (JSON.stringify(prev.helios) !== JSON.stringify(next.helios)) this.#helios.clear();
    const routeKey = (x: TransportSettings) =>
      JSON.stringify([
        x.mode,
        x.chain,
        x.anonNetwork,
        x.anonConfig,
        x.rpcUrl,
        x.myNodeUrl,
        x.helios,
      ]);
    if (routeKey(prev) !== routeKey(next)) this.health.reset();
    this.#settings = next;
  }

  /** The viem transport for the active mode on `chain` (defaults to the active chain). */
  transport(chain: ChainKey = this.#settings.chain): Transport {
    const s = this.#settings;
    switch (s.mode) {
      case "private":
        return this.#anonTransport(chain, true);
      case "mynode": {
        const url = s.myNodeUrl?.[chain];
        if (!url) return failing("mynode", `No node URL configured for ${chain}`);
        const node = http(url, {
          fetchFn: countingFetch(trackedFetch(this.#fetch, this.health), this.counter, "my-node"),
          batch: true,
        });
        return broadcastViaAnon(node, this.#anonTransport(chain, false));
      }
      case "verified": {
        const upstream = s.helios?.[chain] ?? heliosUpstreams[chain];
        if (!upstream) {
          return failing(
            "verified",
            `Verified mode needs a consensus endpoint for ${chain}; set one in Settings`,
          );
        }
        const key = `${chain}|${upstream.executionRpc}|${upstream.consensusRpc}`;
        let provider = this.#helios.get(key);
        if (!provider) {
          provider = this.#heliosFactory({ chain, ...upstream });
          provider.catch(() => this.#helios.delete(key)); // allow a retry after failure
          this.#helios.set(key, provider);
        }
        const p = provider;
        const helios = custom({
          request: async (args) => {
            this.counter.add("helios-direct");
            return this.health.track(async () => (await p).request(args));
          },
        });
        return broadcastViaAnon(helios, this.#anonTransport(chain, false));
      }
    }
  }

  /**
   * A fetch through the active anonymity network, counted as "anon-rpc". For
   * non-Ethereum JSON-RPC endpoints we read in every mode (e.g. Arkiv labels).
   */
  anonFetch(): typeof fetch {
    const s = this.#settings;
    const inner = this.pool.fetchFor(s.anonNetwork, {
      config: s.anonConfig?.[s.anonNetwork],
      allowInsecure: s.allowInsecureReferenceWorker === true,
    });
    return countingFetch(inner, this.counter, "anon-rpc");
  }

  /**
   * A DIRECT (non-anonymised) transport for one user-approved action. The
   * literal `true` type makes accidental use a compile error.
   */
  directOnce(chain: ChainKey, approval: { userConfirmed: true }): Transport {
    if (approval.userConfirmed !== true)
      throw new Error("direct transport requires explicit user confirmation");
    const url = this.#settings.rpcUrl?.[chain] ?? publicRpc(chain);
    return http(url, {
      fetchFn: countingFetch(this.#fetch, this.counter, "direct-approved"),
      retryCount: 0,
    });
  }

  /** `main`: this is the mode's main route, so track its health. */
  #anonTransport(chain: ChainKey, main: boolean): Transport {
    const s = this.#settings;
    const url = s.rpcUrl?.[chain] ?? publicRpc(chain);
    const anonFetch = this.pool.fetchFor(s.anonNetwork, {
      config: s.anonConfig?.[s.anonNetwork],
      allowInsecure: s.allowInsecureReferenceWorker === true,
    });
    return http(url, {
      fetchFn: countingFetch(
        main ? trackedFetch(anonFetch, this.health) : anonFetch,
        this.counter,
        "anon-rpc",
      ),
      batch: { wait: 16 },
      timeout: ANON_TIMEOUT_MS,
      retryCount: 1,
    });
  }
}

/** Route eth_sendRawTransaction through `anon`, everything else through `main`. */
function broadcastViaAnon(main: Transport, anon: Transport): Transport {
  return (params) => {
    const m = main(params);
    const a = anon(params);
    return createTransport({
      key: "selfnode",
      name: "Selfnode router",
      type: "selfnode",
      retryCount: 0,
      request: ((args) =>
        args.method === "eth_sendRawTransaction"
          ? a.request(args)
          : m.request(args)) as EIP1193RequestFn,
    });
  };
}

/** A transport that rejects every call with a clear, user-facing reason. */
function failing(mode: TransportSettings["mode"], message: string): Transport {
  return custom({
    request: () => Promise.reject(new TransportUnavailableError(mode, message)),
  });
}
