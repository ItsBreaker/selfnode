/**
 * Phase 0 spike: Anon-RPC with real anonymising networks.
 * For each network: time to ready, eth_blockNumber on Sepolia and mainnet via
 * viem with worker.fetch, and whether the exit IP differs from our direct IP
 * (only the boolean is recorded; our own IP is never written anywhere).
 */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { createPublicClient, http, type EIP1193Parameters } from "viem";
import {
  anonNetworks,
  publicRpc,
  type AnonNetworkId,
  type ChainKey,
} from "@selfnode/core/config/index";
import { report, now, ms, errMsg } from "./report";

const params = new URLSearchParams(location.search);
const only = params.get("networks")?.split(",") as AnonNetworkId[] | undefined;
const TIMEOUT = Number(params.get("timeout") ?? 180_000);
const RPC_INDEX = Number(params.get("rpc") ?? 0);

/** Bootstrap provider: direct (NOT anonymised), used once to read the specifier. */
function bootstrapProvider(chain: ChainKey) {
  const url = publicRpc(chain);
  let id = 0;
  return {
    async request({ method, params }: EIP1193Parameters) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      });
      const j = (await r.json()) as { result?: unknown; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j.result;
    },
  };
}

const withTimeout = <T>(p: Promise<T>, label: string) =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), TIMEOUT)),
  ]);

async function ipOf(f: typeof fetch) {
  const r = await f("https://api.ipify.org?format=json");
  return ((await r.json()) as { ip: string }).ip;
}

async function run(id: AnonNetworkId) {
  const net = anonNetworks[id];
  const result: Record<string, unknown> = { network: id, kind: net.kind };
  const logs: string[] = [];
  const t0 = now();
  const worker = new AnonRpcWorker({
    address: net.specifier,
    config: net.defaultConfig,
    preExisting: { rpcProvider: bootstrapProvider(net.specifierChain) },
  } as ConstructorParameters<typeof AnonRpcWorker>[0]);
  void (async () => {
    for (;;) {
      try {
        const { level, args } = await worker.acceptLog();
        logs.push(`${level}: ${args.map(String).join(" ").slice(0, 200)}`);
      } catch {
        return;
      }
    }
  })();
  try {
    await withTimeout(worker.ready, "ready");
    result.readyMs = ms(t0);
    for (const chain of ["sepolia", "mainnet"] as const) {
      const url = publicRpc(chain, RPC_INDEX);
      result[`${chain}Rpc`] = url;
      const client = createPublicClient({
        transport: http(url, { fetchFn: worker.fetch, retryCount: 0, timeout: TIMEOUT }),
      });
      try {
        let t = now();
        const bn = await withTimeout(client.getBlockNumber({ cacheTime: 0 }), `${chain} bn`);
        const first = ms(t);
        t = now();
        await withTimeout(client.getChainId(), `${chain} chainId`);
        const second = ms(t);
        // Batch: 5 calls in one JSON-RPC batch request.
        const batchClient = createPublicClient({
          transport: http(url, {
            fetchFn: worker.fetch,
            batch: true,
            retryCount: 0,
            timeout: TIMEOUT,
          }),
        });
        t = now();
        await withTimeout(
          Promise.all(
            [0, 1, 2, 3, 4].map((i) => batchClient.getBlock({ blockNumber: bn - BigInt(i) })),
          ),
          `${chain} batch`,
        );
        result[chain] = {
          blockNumber: bn.toString(),
          firstMs: first,
          secondMs: second,
          batch5Ms: ms(t),
        };
      } catch (e) {
        result[chain] = { error: errMsg(e) };
      }
    }
    try {
      const [direct, viaAnon] = await Promise.all([
        ipOf(fetch),
        withTimeout(ipOf(worker.fetch), "ip"),
      ]);
      result.exitIpDiffersFromDirect = direct !== viaAnon;
    } catch (e) {
      result.ipCheck = { error: errMsg(e) };
    }
  } catch (e) {
    result.error = errMsg(e);
    result.failedAfterMs = ms(t0);
  } finally {
    result.logs = logs.slice(-25);
    worker.close();
  }
  return result;
}

const ids = only ?? (["tor-js", "nym", "nox"] as AnonNetworkId[]);
const results = await Promise.all(ids.map(run));
report(`anon-rpc-${ids.join("-")}`, { userAgent: navigator.userAgent, results });
