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
  WorkerCodeChangedError,
  type WorkerCodeChange,
  type WorkerFactory,
  type WorkerPinStore,
} from "./anon-pool.js";
import { InsecureWorkerError, TransportUnavailableError } from "./errors.js";
import { heliosProviderFactory, type HeliosFactory } from "./helios.js";
import { HealthTracker, trackedFetch } from "./health.js";
import { countingFetch, countRpcCalls, TrafficCounter } from "./traffic.js";
import type { Eip1193Like, TransportSettings } from "./types.js";

/**
 * viem's own cutoff for one request through an anonymity network. Generous:
 * the router applies the real limits (first-connect, failover) itself.
 */
export const ANON_TIMEOUT_MS = 200_000;

/** A request through the anonymity network taking longer than this counts as a failure for failover. */
export const FAILOVER_TIMEOUT_MS = 20_000;
/** With nowhere to switch to, a request may take this long once the network is up. */
export const SETTLED_TIMEOUT_MS = 45_000;
/**
 * How long a request may take while a network is still making its first
 * connection. Nym's first connection can take a minute or two.
 */
export const FIRST_CONNECT_MS: Record<AnonNetworkId, number> = {
  nox: 60_000,
  nym: 180_000,
  "tor-js": 180_000,
  passthrough: 30_000,
};
/** Waits before retrying a read that failed during the first connection (then give up). */
export const RETRY_BACKOFF_MS: readonly number[] = [1_000, 3_000];
/** Consecutive failures on one network before switching (some errors switch at once). */
export const FAILOVER_AFTER_FAILURES = 2;
/** How long a failure waits for the backup network to be ready before giving up on switching (this time). */
export const BACKUP_WAIT_MS = 1_500;
/** After a failover, check the preferred network again after these waits (the last repeats). */
export const RECOVERY_PROBE_MS: readonly number[] = [60_000, 120_000, 240_000];
/** Fallback order. Tor is only used if the user configured a gateway. */
export const FAILOVER_ORDER: readonly AnonNetworkId[] = ["nox", "nym", "tor-js"];

export interface FailoverEvent {
  /** "failover": moved off a failing network. "recovered": back on the preferred one. */
  kind: "failover" | "recovered";
  from: AnonNetworkId;
  to: AnonNetworkId;
  reason: string;
  at: number;
}

/** A read being retried while a network makes its first connection. */
export interface RetryState {
  network: AnonNetworkId;
  /** The attempt now running (2 = first retry). */
  attempt: number;
  of: number;
}

export interface NetworkTestResult {
  id: AnonNetworkId;
  ok: boolean;
  ms: number;
  error?: string;
}

/** Errors that mean "this network can't carry traffic right now": switch at once. */
const HARD_FAILURE =
  /NoTunnelExit|no (tunnel )?exits?|exit (node|unavailable)|tunnel|failed to boot|gateways? failed/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).split("\n")[0]?.slice(0, 160) ?? "";

/** Races `p` against a timer that rejects with a FailoverTimeout error. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} didn't answer within ${Math.round(ms / 1000)} s`);
          err.name = "FailoverTimeout";
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const CHAIN_ID_BODY = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });

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
  /** Networks failover moved off; skipped until the preferred network recovers. */
  #failedNets = new Set<AnonNetworkId>();
  #failoverListeners = new Set<() => void>();
  #prewarmed = new Set<AnonNetworkId>();
  #retry: RetryState | null = null;
  #retryListeners = new Set<() => void>();
  #probeTimer: ReturnType<typeof setTimeout> | undefined;
  #probeStep = 0;

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

  /** A read being retried during a first connection, or null. */
  get retryState(): RetryState | null {
    return this.#retry;
  }

  subscribeRetry(l: () => void): () => void {
    this.#retryListeners.add(l);
    return () => this.#retryListeners.delete(l);
  }

  #setRetry(r: RetryState | null): void {
    if (r === null && this.#retry === null) return;
    this.#retry = r;
    for (const l of this.#retryListeners) l();
  }

  /** Go back to the user's chosen network (restarting its worker). */
  retryPreferred(): void {
    const preferred = this.#settings.anonNetwork;
    if (this.#active === preferred) return;
    this.pool.close(preferred);
    this.#backTo(preferred);
  }

  #backTo(preferred: AnonNetworkId): void {
    this.#active = preferred;
    this.#failedNets.clear();
    this.#consecutiveFailures = 0;
    this.#stopProbe();
    this.health.reset();
    this.#emitFailover();
  }

  #emitFailover(): void {
    for (const l of this.#failoverListeners) l();
  }

  /** Networks failover may use, in order (Tor only with a gateway configured). */
  #usable(): AnonNetworkId[] {
    const s = this.#settings;
    const order = [s.anonNetwork, ...FAILOVER_ORDER.filter((n) => n !== s.anonNetwork)];
    return order.filter(
      (n) =>
        anonNetworks[n].kind === "network" &&
        (n !== "tor-js" || s.anonConfig?.["tor-js"] !== undefined),
    );
  }

  /** The next network failover may use after the one that failed. */
  #nextNetwork(after: AnonNetworkId): AnonNetworkId | null {
    const usable = this.#usable().filter((n) => n === after || !this.#failedNets.has(n));
    const i = usable.indexOf(after);
    return usable[i + 1] ?? null;
  }

  /**
   * Record a failure on `id`; switch networks if warranted. Returns true if it
   * switched. A transient failure only switches to a backup that's already up
   * (starting it if needed, waiting up to BACKUP_WAIT_MS): moving to a network
   * that's still booting (Nym can take minutes) is worse than retrying.
   */
  async #noteFailure(id: AnonNetworkId, e: unknown): Promise<boolean> {
    if (this.#settings.anonFailover === false || id !== this.#active) return false;
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const timedOut = e instanceof Error && e.name === "FailoverTimeout";
    const bootFailed = this.pool.status(id).status.state === "failed";
    this.#consecutiveFailures++;
    const hard = timedOut || bootFailed || HARD_FAILURE.test(msg);
    if (!hard && this.#consecutiveFailures < FAILOVER_AFTER_FAILURES) return false;
    const to = this.#nextNetwork(id);
    if (!to) return false;
    if (!bootFailed && !(await this.#backupReady(to))) return false;
    if (id !== this.#active) return true; // another request already switched
    const reason = timedOut
      ? `no answer within ${(e as Error).message.match(/within (\d+) s/)?.[1] ?? FAILOVER_TIMEOUT_MS / 1000} s`
      : bootFailed
        ? `couldn't start (${(this.pool.status(id).status as { error?: string }).error ?? msg})`.slice(
            0,
            160,
          )
        : hard
          ? (msg.split("\n")[0]?.slice(0, 160) ?? msg)
          : `${this.#consecutiveFailures} failures in a row`;
    this.#failovers = [
      ...this.#failovers,
      { kind: "failover", from: id, to, reason, at: Date.now() },
    ];
    this.#failedNets.add(id);
    this.#active = to;
    this.#consecutiveFailures = 0;
    this.health.reset();
    this.#emitFailover();
    this.#scheduleProbe(true);
    return true;
  }

  /** Start `id`'s worker if needed and wait briefly for it to be ready. */
  async #backupReady(id: AnonNetworkId): Promise<boolean> {
    try {
      this.pool.fetchFor(id, { config: this.#settings.anonConfig?.[id] });
    } catch {
      return false;
    }
    for (let t = 0; t <= BACKUP_WAIT_MS; t += 100) {
      const st = this.pool.status(id).status.state;
      if (st === "ready") return true;
      if (st === "failed") return false;
      await sleep(100);
    }
    return false;
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

  // --- Recovery: back to the preferred network when it works again ----------

  #stopProbe(): void {
    clearTimeout(this.#probeTimer);
    this.#probeTimer = undefined;
    this.#probeStep = 0;
  }

  #scheduleProbe(restart = false): void {
    if (restart) this.#stopProbe();
    if (this.#probeTimer !== undefined) return;
    const s = this.#settings;
    if (s.anonFailover === false || this.#active === s.anonNetwork) return;
    const wait =
      RECOVERY_PROBE_MS[Math.min(this.#probeStep, RECOVERY_PROBE_MS.length - 1)] ?? 240_000;
    this.#probeStep++;
    const t = setTimeout(() => {
      this.#probeTimer = undefined;
      void this.#probe();
    }, wait);
    (t as { unref?: () => void }).unref?.();
    this.#probeTimer = t;
  }

  /** One check of the preferred network (a counted eth_chainId through it). */
  async #probe(): Promise<void> {
    const preferred = this.#settings.anonNetwork;
    if (this.#settings.anonFailover === false || this.#active === preferred) return;
    const r = await this.#testOne(preferred, true);
    if (this.#settings.anonNetwork !== preferred || this.#active === preferred) return;
    if (!r.ok) {
      this.#scheduleProbe();
      return;
    }
    const from = this.#active;
    this.#failovers = [
      ...this.#failovers,
      {
        kind: "recovered",
        from,
        to: preferred,
        reason: `${anonNetworks[preferred].label} answered again`,
        at: Date.now(),
      },
    ];
    this.#backTo(preferred);
  }

  /**
   * Send one eth_chainId through `id` (counted as Anon-RPC traffic), without
   * changing the active network. `fresh` restarts a worker that failed.
   */
  async #testOne(id: AnonNetworkId, fresh: boolean): Promise<NetworkTestResult> {
    const s = this.#settings;
    const started = Date.now();
    try {
      if (fresh && this.pool.status(id).status.state === "failed") this.pool.close(id);
      const inner = this.pool.fetchFor(id, {
        config: s.anonConfig?.[id],
        allowInsecure: s.allowInsecureReferenceWorker === true,
      });
      const res = await withTimeout(
        countingFetch(
          inner,
          this.counter,
          "anon-rpc",
        )(s.rpcUrl?.[s.chain] ?? publicRpc(s.chain), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: CHAIN_ID_BODY,
        }),
        this.pool.status(id).status.state === "ready" ? SETTLED_TIMEOUT_MS : FIRST_CONNECT_MS[id],
        anonNetworks[id].label,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: string; error?: { message?: string } };
      if (!body.result) throw new Error(body.error?.message ?? "no result");
      return { id, ok: true, ms: Date.now() - started };
    } catch (e) {
      return { id, ok: false, ms: Date.now() - started, error: errText(e) };
    }
  }

  /**
   * Check every network failover could use, one request each, in parallel.
   * Doesn't change which network is active.
   */
  async testNetworks(onResult?: (r: NetworkTestResult) => void): Promise<NetworkTestResult[]> {
    return Promise.all(
      this.#usable().map(async (id) => {
        const r = await this.#testOne(id, true);
        onResult?.(r);
        return r;
      }),
    );
  }

  /**
   * A fetch through whichever anonymity network is active, failing over to the
   * next one (never to a direct connection). Reads are retried on the new
   * network, and retried with backoff while a network makes its first
   * connection; a broadcast isn't (it may already have been sent), so it fails
   * and the next one uses the new network. Failed attempts are counted as
   * failed, never as traffic.
   */
  #failoverFetch(): typeof fetch {
    return async (input, init) => {
      const broadcast =
        typeof init?.body === "string" && init.body.includes("eth_sendRawTransaction");
      let switches = 0;
      let retries = 0;
      for (;;) {
        const id = this.#active;
        const s = this.#settings;
        const inner = this.pool.fetchFor(id, {
          config: s.anonConfig?.[id],
          allowInsecure: s.allowInsecureReferenceWorker === true,
        });
        const firstConnect = this.pool.status(id).status.state !== "ready";
        // The 20 s cutoff only makes sense if there's somewhere to switch to.
        // While a network makes its first connection it gets longer.
        const canSwitch = s.anonFailover !== false && this.#nextNetwork(id) !== null;
        const limit = firstConnect
          ? FIRST_CONNECT_MS[id]
          : canSwitch
            ? FAILOVER_TIMEOUT_MS
            : SETTLED_TIMEOUT_MS;
        try {
          const res = await withTimeout(inner(input, init), limit, anonNetworks[id].label);
          this.#consecutiveFailures = 0;
          if (this.#retry?.network === id) this.#setRetry(null);
          this.#prewarm();
          return res;
        } catch (e) {
          const switched = await this.#noteFailure(id, e);
          const last = () => {
            this.#setRetry(null);
            return e;
          };
          if (broadcast) throw last();
          if (switched) {
            if (switches++ < 2) {
              this.counter.addFailed(countRpcCalls(init?.body));
              retries = 0;
              continue;
            }
            throw last();
          }
          // No switch: retry on the same network while it's still connecting.
          // A refused code change is the user's decision; don't ask again.
          const final = e instanceof WorkerCodeChangedError || e instanceof InsecureWorkerError;
          if (firstConnect && !final && retries < RETRY_BACKOFF_MS.length) {
            this.counter.addFailed(countRpcCalls(init?.body));
            const wait = RETRY_BACKOFF_MS[retries] ?? 1_000;
            retries++;
            this.#setRetry({ network: id, attempt: retries + 1, of: RETRY_BACKOFF_MS.length + 1 });
            await sleep(wait);
            // A worker that failed to start is started again for the retry.
            if (this.pool.status(id).status.state === "failed") this.pool.close(id);
            continue;
          }
          throw last();
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
      this.#failedNets.clear();
      this.#prewarmed.clear();
      this.#stopProbe();
      this.#setRetry(null);
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
            try {
              const out = await this.health.track(async () => (await p).request(args));
              this.counter.add("helios-direct");
              return out;
            } catch (e) {
              this.counter.addFailed();
              throw e;
            }
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
      // The router retries itself (with backoff, or on another network).
      retryCount: 0,
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
