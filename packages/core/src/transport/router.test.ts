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
    expect(s["my-node"]).toBe(1);
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
