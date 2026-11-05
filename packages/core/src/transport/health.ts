/**
 * Health of the active route: latency, last success, last error, in-flight
 * count. Feeds the connection-mode indicator so it always tells the truth.
 */
export interface HealthSnapshot {
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  /** Exponential moving average of successful request latency, ms. */
  latencyMs: number | null;
  inflight: number;
  /** A problem that persists until the route changes (e.g. node on the wrong chain). */
  fatal: string | null;
}

export class HealthTracker {
  #s: HealthSnapshot = {
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    latencyMs: null,
    inflight: 0,
    fatal: null,
  };
  #listeners = new Set<() => void>();
  constructor(private readonly now: () => number = Date.now) {}

  async track<T>(work: () => Promise<T>): Promise<T> {
    const t0 = this.now();
    this.#set({ inflight: this.#s.inflight + 1 });
    try {
      const out = await work();
      const dt = this.now() - t0;
      const ema = this.#s.latencyMs === null ? dt : Math.round(this.#s.latencyMs * 0.7 + dt * 0.3);
      this.#set({ inflight: this.#s.inflight - 1, lastOkAt: this.now(), latencyMs: ema });
      return out;
    } catch (e) {
      this.#set({
        inflight: this.#s.inflight - 1,
        lastErrorAt: this.now(),
        lastError: e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e),
      });
      throw e;
    }
  }

  setFatal(problem: string | null): void {
    this.#set({ fatal: problem });
  }

  snapshot(): HealthSnapshot {
    return this.#s;
  }

  subscribe(l: () => void): () => void {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  }

  reset(): void {
    this.#s = {
      lastOkAt: null,
      lastErrorAt: null,
      lastError: null,
      latencyMs: null,
      inflight: 0,
      fatal: null,
    };
    this.#emit();
  }

  #set(patch: Partial<HealthSnapshot>): void {
    this.#s = { ...this.#s, ...patch }; // new object: safe for useSyncExternalStore
    this.#emit();
  }
  #emit(): void {
    for (const l of this.#listeners) l();
  }
}

/** Wrap a fetch so each call is tracked. */
export function trackedFetch(inner: typeof fetch, health: HealthTracker): typeof fetch {
  return (input, init) => health.track(() => inner(input, init));
}
