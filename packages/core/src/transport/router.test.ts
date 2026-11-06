import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { TransportRouter } from "./router.js";
import { InsecureWorkerError } from "./errors.js";
import type { AnonWorkerLike, Eip1193Like, TransportSettings } from "./types.js";
import type { WorkerInit } from "./anon-pool.js";

// --- Test fixtures (clearly fake; never used by the app) ---------------------
const rpcReply = (body: unknown) => {
  const handle = (req: { id: number; method: string }) => ({
    jsonrpc: "2.0",
    id: req.id,
    result: req.method === "eth_sendRawTransaction" ? `0x${"ab".repeat(32)}` : "0x10",
  });
  const parsed = JSON.parse(String(body)) as
    { id: number; method: string } | { id: number; method: string }[];
  return new Response(JSON.stringify(Array.isArray(parsed) ? parsed.map(handle) : handle(parsed)));
};

function fakeWorker(opts: { fail?: boolean } = {}) {
  const calls: { url: string; methods: string[] }[] = [];
  const factory = vi.fn(async (init: WorkerInit): Promise<AnonWorkerLike> => {
    await init.rpcProvider.request({ method: "eth_call", params: [] }); // the specifier read
    return {
      ready: opts.fail ? Promise.reject(new Error("worker declined")) : Promise.resolve(),
      fetch: async (input, init2) => {
        if (opts.fail) throw new Error("worker declined");
        const parsed = JSON.parse(String(init2?.body)) as { method: string } | { method: string }[];
        calls.push({ url: String(input), methods: [parsed].flat().map((p) => p.method) });
        return rpcReply(init2?.body);
      },
      close: () => undefined,
    };
  });
  return { factory, calls };
}

function directFetchSpy() {
  const urls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(input instanceof Request ? input.url : String(input));
    return rpcReply(init?.body);
  }) as unknown as typeof fetch;
  return { fn, urls };
}

const base: TransportSettings = { mode: "private", chain: "sepolia", anonNetwork: "nox" };
const RAW_TX = "0x02f86b83aa36a7";

describe("TransportRouter", () => {
  it("routes Private mode reads through the Anon-RPC worker and counts them", async () => {
    const w = fakeWorker();
    const direct = directFetchSpy();
    const router = new TransportRouter(base, { workerFactory: w.factory, fetch: direct.fn });
    const client = createPublicClient({ transport: router.transport() });
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(w.calls[0]?.url).toContain("sepolia");
    const s = router.counter.snapshot();
    expect(s["anon-rpc"]).toBe(1);
    expect(s.bootstrap).toBe(1); // only the specifier read went direct
    expect(direct.urls).toHaveLength(1); // and that was the bootstrap provider
    expect(router.health.snapshot().lastOkAt).not.toBeNull();
  });

  it("counts each call inside a JSON-RPC batch", async () => {
    const w = fakeWorker();
    const router = new TransportRouter(base, {
      workerFactory: w.factory,
      fetch: directFetchSpy().fn,
    });
    const client = createPublicClient({ transport: router.transport() });
    await Promise.all([
      client.getChainId(),
      client.getBlockNumber({ cacheTime: 0 }),
      client.getGasPrice(),
    ]);
    expect(router.counter.snapshot()["anon-rpc"]).toBe(3);
  });

  it("never falls back to a direct RPC when the worker fails", async () => {
    const w = fakeWorker({ fail: true });
    const direct = directFetchSpy();
    const router = new TransportRouter(base, { workerFactory: w.factory, fetch: direct.fn });
    const client = createPublicClient({ transport: router.transport() });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow();
    // The only direct request is the disclosed bootstrap read; no RPC fallback.
    expect(direct.urls).toHaveLength(1);
    expect(router.counter.snapshot()["direct-approved"]).toBe(0);
  });

  it("refuses the non-anonymising passthrough worker unless explicitly allowed", () => {
    const router = new TransportRouter(
      { ...base, anonNetwork: "passthrough" },
      { workerFactory: fakeWorker().factory },
    );
    expect(() => router.transport()).toThrow(InsecureWorkerError);
    router.update({ ...base, anonNetwork: "passthrough", allowInsecureReferenceWorker: true });
    expect(() => router.transport()).not.toThrow();
  });

  it("My node mode reads from the node but broadcasts through Anon-RPC", async () => {
    const w = fakeWorker();
    const direct = directFetchSpy();
    const settings: TransportSettings = {
      ...base,
      mode: "mynode",
      myNodeUrl: { sepolia: "http://127.0.0.1:8545" },
    };
    const router = new TransportRouter(settings, { workerFactory: w.factory, fetch: direct.fn });
    const client = createPublicClient({ transport: router.transport() });
    await client.getBlockNumber({ cacheTime: 0 });
    await client.sendRawTransaction({ serializedTransaction: RAW_TX });
    expect(direct.urls.some((u) => u.startsWith("http://127.0.0.1:8545"))).toBe(true);
    expect(w.calls.flatMap((c) => c.methods)).toEqual(["eth_sendRawTransaction"]);
    const s = router.counter.snapshot();
    // The read, plus the specifier (bootstrap) read, which now also goes to the node.
    expect(s["my-node"]).toBe(2);
    expect(s.bootstrap).toBe(0);
    expect(s["anon-rpc"]).toBe(1);
  });

  it("My node mode without a URL fails clearly instead of using a public RPC", async () => {
    const router = new TransportRouter(
      { ...base, mode: "mynode" },
      { workerFactory: fakeWorker().factory },
    );
    const client = createPublicClient({ transport: router.transport() });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow(/No node URL configured/);
  });

  it("Verified mode reads via Helios and still broadcasts through Anon-RPC", async () => {
    const w = fakeWorker();
    const helios: Eip1193Like = { request: vi.fn(async () => "0x20") };
    const router = new TransportRouter(
      { ...base, mode: "verified", chain: "mainnet" },
      { workerFactory: w.factory, heliosFactory: async () => helios, fetch: directFetchSpy().fn },
    );
    const client = createPublicClient({ transport: router.transport() });
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(32n);
    await client.sendRawTransaction({ serializedTransaction: RAW_TX });
    expect(w.calls.flatMap((c) => c.methods)).toEqual(["eth_sendRawTransaction"]);
    expect(router.counter.snapshot()["helios-direct"]).toBe(1);
  });

  it("Verified mode on a chain without a consensus endpoint fails clearly", async () => {
    const router = new TransportRouter(
      { ...base, mode: "verified", chain: "sepolia" },
      { workerFactory: fakeWorker().factory },
    );
    const client = createPublicClient({ transport: router.transport() });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow(/consensus endpoint/);
  });

  it("direct requests need explicit approval and are counted separately", async () => {
    const direct = directFetchSpy();
    const router = new TransportRouter(base, {
      workerFactory: fakeWorker().factory,
      fetch: direct.fn,
    });
    const client = createPublicClient({
      transport: router.directOnce("sepolia", { userConfirmed: true }),
    });
    await client.getBlockNumber({ cacheTime: 0 });
    expect(router.counter.snapshot()["direct-approved"]).toBe(1);
    expect(router.counter.anonShare()).toBe(0);
  });
});

// --- Worker-hash pinning and the bootstrap route -----------------------------
import { WORKER_HASH_SELECTOR, WorkerCodeChangedError, type WorkerPinStore } from "./anon-pool.js";

const H1 = `0x${"11".repeat(32)}`;
const H2 = `0x${"22".repeat(32)}`;
/** A specifier that answers workerHash() with `hash`, recording which URL was asked. */
function specifierFetch(hash: () => string) {
  const urls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    const req = JSON.parse(String(init?.body)) as { id: number };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: hash() }));
  }) as unknown as typeof fetch;
  return { fn, urls };
}
/** Like the real harness: reads workerHash() first and fails to boot if that throws. */
const hashReadingFactory = vi.fn(async (init: WorkerInit): Promise<AnonWorkerLike> => {
  await init.rpcProvider.request({
    method: "eth_call",
    params: [{ to: init.address, data: WORKER_HASH_SELECTOR }, "latest"],
  });
  return { ready: Promise.resolve(), fetch: async (_i, i2) => rpcReply(i2?.body), close: () => {} };
});
const memoryPins = (
  init: Record<string, string> = {},
): WorkerPinStore & { all: Record<string, string> } => {
  const all: Record<string, string> = { ...init };
  return { all, get: (id) => all[id] ?? null, set: (id, h) => void (all[id] = h) };
};
const boot = async (router: TransportRouter, id: "nox" | "nym" = "nox") => {
  router.pool.fetchFor(id);
  for (let i = 0; i < 50; i++) {
    const s = router.pool.status(id).status;
    if (s.state === "ready" || s.state === "failed") return s;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("worker never settled");
};

describe("Anon-RPC worker code pinning", () => {
  it("pins the worker hash after the first successful boot", async () => {
    const pins = memoryPins();
    const router = new TransportRouter(base, {
      workerFactory: hashReadingFactory,
      fetch: specifierFetch(() => H1).fn,
      pins,
    });
    expect((await boot(router)).state).toBe("ready");
    expect(pins.all.nox).toBe(H1);
  });

  it("refuses changed code when nobody accepts it, and keeps the old pin", async () => {
    const pins = memoryPins({ nox: H1 });
    const router = new TransportRouter(base, {
      workerFactory: hashReadingFactory,
      fetch: specifierFetch(() => H2).fn,
      pins,
    });
    const s = await boot(router);
    expect(s.state).toBe("failed");
    expect(s.state === "failed" && s.error).toMatch(/code changed since you last used it/);
    expect(pins.all.nox).toBe(H1);
    // No fallback: reads fail rather than going anywhere else.
    const client = createPublicClient({ transport: router.transport() });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow();
  });

  it("asks the user, and only re-pins when they accept", async () => {
    for (const accept of [false, true]) {
      const pins = memoryPins({ nox: H1 });
      const ask = vi.fn(async () => accept);
      const router = new TransportRouter(base, {
        workerFactory: hashReadingFactory,
        fetch: specifierFetch(() => H2).fn,
        pins,
        onWorkerCodeChange: ask,
      });
      expect((await boot(router)).state).toBe(accept ? "ready" : "failed");
      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({ network: "nox", previous: H1, current: H2 }),
      );
      expect(pins.all.nox).toBe(accept ? H2 : H1);
    }
  });

  it("doesn't ask when the hash is unchanged", async () => {
    const ask = vi.fn(async () => true);
    const router = new TransportRouter(base, {
      workerFactory: hashReadingFactory,
      fetch: specifierFetch(() => H1).fn,
      pins: memoryPins({ nox: H1 }),
      onWorkerCodeChange: ask,
    });
    expect((await boot(router)).state).toBe("ready");
    expect(ask).not.toHaveBeenCalled();
  });

  it("exports the error type for the UI", () => {
    expect(
      new WorkerCodeChangedError({ network: "nox", label: "Nox", previous: H1, current: H2 }).name,
    ).toBe("WorkerCodeChangedError");
  });
});

describe("bootstrap read route", () => {
  it("goes to the user's own node in My node mode (Nox's specifier is on Sepolia)", async () => {
    const spec = specifierFetch(() => H1);
    const router = new TransportRouter(
      { ...base, mode: "mynode", myNodeUrl: { sepolia: "http://127.0.0.1:8545" } },
      { workerFactory: hashReadingFactory, fetch: spec.fn },
    );
    await boot(router);
    expect(spec.urls).toEqual(["http://127.0.0.1:8545"]);
    const s = router.counter.snapshot();
    expect(s.bootstrap).toBe(0);
    expect(s["my-node"]).toBe(1);
  });

  it("uses the public bootstrap RPC in Private mode, or when the node is on another chain", async () => {
    const a = specifierFetch(() => H1);
    await boot(new TransportRouter(base, { workerFactory: hashReadingFactory, fetch: a.fn }));
    expect(a.urls[0]).toContain("sepolia");
    // Nym's specifier is on Ethereum; a Sepolia-only node can't answer it.
    const b = specifierFetch(() => H1);
    const r = new TransportRouter(
      {
        ...base,
        mode: "mynode",
        anonNetwork: "nym",
        myNodeUrl: { sepolia: "http://127.0.0.1:8545" },
      },
      { workerFactory: hashReadingFactory, fetch: b.fn },
    );
    await boot(r, "nym");
    expect(b.urls[0]).not.toContain("127.0.0.1");
    expect(r.counter.snapshot().bootstrap).toBe(1);
  });
});
