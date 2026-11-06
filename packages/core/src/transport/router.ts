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
import { anonNetworks, type AnonNetworkId } from "../config/anon-rpc.js";
import { publicRpc, type ChainKey } from "../config/chains.js";
import { heliosUpstreams } from "../config/helios.js";
import {
  AnonWorkerPool,
  type WorkerCodeChange,
  type WorkerFactory,
  type WorkerPinStore,
} from "./anon-pool.js";
import { TransportUnavailableError } from "./errors.js";
import { heliosProviderFactory, type HeliosFactory } from "./helios.js";
import { HealthTracker, trackedFetch } from "./health.js";
import { countingFetch, TrafficCounter } from "./traffic.js";
import type { Eip1193Like, TransportSettings } from "./types.js";

/** Anonymity networks are slow to start; Nym's first call took 13 s in Phase 0. */
export const ANON_TIMEOUT_MS = 45_000;

/** A request through the anonymity network taking longer than this counts as a failure for failover. */
export const FAILOVER_TIMEOUT_MS = 20_000;
/** Consecutive failures on one network before switching (some errors switch at once). */
export const FAILOVER_AFTER_FAILURES = 2;
/** Fallback order. Tor is only used if the user configured a gateway. */
export const FAILOVER_ORDER: readonly AnonNetworkId[] = ["nox", "nym", "tor-js"];

export interface FailoverEvent {
  from: AnonNetworkId;
  to: AnonNetworkId;
  reason: string;
  at: number;
}

/** Errors that mean "this network can't carry traffic right now": switch at once. */
const HARD_FAILURE =
  /NoTunnelExit|no (tunnel )?exits?|exit (node|unavailable)|tunnel|failed to boot|gateways? failed/i;

export interface RouterDeps {
  counter?: TrafficCounter;
  workerFactory?: WorkerFactory;
  heliosFactory?: HeliosFactory;
  fetch?: typeof fetch;
  /** Worker-hash pinning and the user's decision when it changes. */
  pins?: WorkerPinStore;
  onWorkerCodeChange?: (change: WorkerCodeChange) => Promise<boolean>;
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
  /** The network actually in use: the user's choice, unless failover moved off it. */
  #active: AnonNetworkId;
  #consecutiveFailures = 0;
  #failovers: FailoverEvent[] = [];
  #failoverListeners = new Set<() => void>();
  #prewarmed = new Set<AnonNetworkId>();

  constructor(settings: TransportSettings, deps: RouterDeps = {}) {
    this.counter = deps.counter ?? new TrafficCounter();
    this.#fetch = deps.fetch ?? ((...a) => fetch(...a));
    this.pool = new AnonWorkerPool(this.counter, deps.workerFactory, this.#fetch, {
      ...(deps.pins ? { pins: deps.pins } : {}),
      ...(deps.onWorkerCodeChange ? { onCodeChange: deps.onWorkerCodeChange } : {}),
      // In My node mode, the specifier read goes to the user's node for that chain.
      nodeFor: (chain) =>
        this.#settings.mode === "mynode" ? (this.#settings.myNodeUrl?.[chain] ?? null) : null,
    });
    this.#heliosFactory = deps.heliosFactory ?? heliosProviderFactory(this.counter, this.#fetch);
    this.#settings = settings;
    this.#active = settings.anonNetwork;
  }

  /** The anonymity network carrying traffic now (differs from the setting after a failover). */
  get activeNetwork(): AnonNetworkId {
    return this.#active;
  }

  /** Automatic switches this session, oldest first. */
  get failovers(): readonly FailoverEvent[] {
    return this.#failovers;
  }

  subscribeFailover(l: () => void): () => void {
    this.#failoverListeners.add(l);
    return () => this.#failoverListeners.delete(l);
  }

  /** Go back to the user's chosen network (restarting its worker). */
  retryPreferred(): void {
    const preferred = this.#settings.anonNetwork;
    if (this.#active === preferred) return;
    this.pool.close(preferred);
    this.#active = preferred;
    this.#consecutiveFailures = 0;
    this.health.reset();
    this.#emitFailover();
  }

  #emitFailover(): void {
    for (const l of this.#failoverListeners) l();
  }

  /** Networks failover may use, in order, after the one that failed. */
  #nextNetwork(after: AnonNetworkId): AnonNetworkId | null {
    const s = this.#settings;
    const order = [s.anonNetwork, ...FAILOVER_ORDER.filter((n) => n !== s.anonNetwork)];
    const usable = order.filter(
      (n) =>
        anonNetworks[n].kind === "network" &&
        (n !== "tor-js" || s.anonConfig?.["tor-js"] !== undefined) &&
        !this.#failovers.some((e) => e.from === n),
    );
    const i = usable.indexOf(after);
    return usable[i + 1] ?? null;
  }

  /** Record a failure on `id`; switch networks if warranted. Returns true if it switched. */
  #noteFailure(id: AnonNetworkId, e: unknown): boolean {
    if (this.#settings.anonFailover === false || id !== this.#active) return false;
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const timedOut = e instanceof Error && e.name === "FailoverTimeout";
    const bootFailed = this.pool.status(id).status.state === "failed";
    this.#consecutiveFailures++;
    const hard = timedOut || bootFailed || HARD_FAILURE.test(msg);
    if (!hard && this.#consecutiveFailures < FAILOVER_AFTER_FAILURES) return false;
    const to = this.#nextNetwork(id);
    if (!to) return false;
    const reason = timedOut
      ? `no answer within ${FAILOVER_TIMEOUT_MS / 1000} s`
      : bootFailed
        ? `couldn't start (${(this.pool.status(id).status as { error?: string }).error ?? msg})`.slice(
            0,
            160,
          )
        : hard
          ? (msg.split("\n")[0]?.slice(0, 160) ?? msg)
          : `${this.#consecutiveFailures} failures in a row`;
    this.#failovers = [...this.#failovers, { from: id, to, reason, at: Date.now() }];
    this.#active = to;
    this.#consecutiveFailures = 0;
    this.health.reset();
    this.#emitFailover();
    return true;
  }

  /** Start the next network's worker in the background, so a failover is quick. */
  #prewarm(): void {
    if (this.#settings.anonFailover === false) return;
    const next = this.#nextNetwork(this.#active);
    if (!next || this.#prewarmed.has(next)) return;
    this.#prewarmed.add(next);
    try {
      this.pool.fetchFor(next, { config: this.#settings.anonConfig?.[next] });
    } catch {
      /* not usable; failover will skip it */
    }
  }

  /**
   * A fetch through whichever anonymity network is active, failing over to the
   * next one (never to a direct connection). Reads are retried on the new
   * network; a broadcast isn't (it may already have been sent), so it fails and
   * the next one uses the new network.
   */
  #failoverFetch(): typeof fetch {
    return async (input, init) => {
      const broadcast =
        typeof init?.body === "string" && init.body.includes("eth_sendRawTransaction");
      for (let attempt = 0; ; attempt++) {
        const id = this.#active;
        const s = this.#settings;
        const inner = this.pool.fetchFor(id, {
          config: s.anonConfig?.[id],
          allowInsecure: s.allowInsecureReferenceWorker === true,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        // The 20 s cutoff only makes sense if there's somewhere to switch to;
        // otherwise let the request take as long as the transport allows (a slow
        // network, e.g. Nym booting, still answers eventually).
        const canSwitch = s.anonFailover !== false && this.#nextNetwork(id) !== null;
        try {
          const res = await Promise.race([
            inner(input, init),
            new Promise<never>((_, reject) => {
              if (!canSwitch) return;
              timer = setTimeout(() => {
                const err = new Error(
                  `${anonNetworks[id].label} didn't answer within ${FAILOVER_TIMEOUT_MS / 1000} s`,
                );
                err.name = "FailoverTimeout";
                reject(err);
              }, FAILOVER_TIMEOUT_MS);
            }),
          ]);
          this.#consecutiveFailures = 0;
          this.#prewarm();
          return res;
        } catch (e) {
          const switched = this.#noteFailure(id, e);
          if (switched && !broadcast && attempt < 2) continue;
          throw e;
        } finally {
          clearTimeout(timer);
        }
      }
    };
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
    // A new choice of network (or turning failover off) starts over from that choice.
    if (prev.anonNetwork !== next.anonNetwork || next.anonFailover === false) {
      this.#active = next.anonNetwork;
      this.#consecutiveFailures = 0;
      this.#failovers = [];
      this.#prewarmed.clear();
      queueMicrotask(() => this.#emitFailover());
    }
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
    this.#assertUsable();
    return countingFetch(this.#failoverFetch(), this.counter, "anon-rpc");
  }

  /** Throws InsecureWorkerError up front if the chosen network doesn't anonymise. */
  #assertUsable(): void {
    const s = this.#settings;
    this.pool.fetchFor(s.anonNetwork, {
      config: s.anonConfig?.[s.anonNetwork],
      allowInsecure: s.allowInsecureReferenceWorker === true,
    });
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
    this.#assertUsable();
    const anonFetch = this.#failoverFetch();
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
