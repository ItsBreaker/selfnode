/**
 * Phase 0 spike: broadcast pre-signed Sepolia transactions through Anon-RPC
 * and wait for receipts through the same worker. No key ever enters the page.
 * Query: ?network=nox&tx=0x...   (tx = signed raw transaction)
 * There is deliberately NO direct-RPC fallback: failure is reported as failure.
 */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { createPublicClient, http, keccak256, type EIP1193Parameters, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { anonNetworks, publicRpc, type AnonNetworkId } from "@selfnode/core/config/index";
import { report, now, ms, errMsg } from "./report";

const q = new URLSearchParams(location.search);
const id = (q.get("network") ?? "nox") as AnonNetworkId;
const raw = q.get("tx") as Hex;
const net = anonNetworks[id];
const boot = publicRpc(net.specifierChain);

const out: Record<string, unknown> = { network: id, expectedHash: keccak256(raw) };
const worker = new AnonRpcWorker({
  address: net.specifier,
  config: net.defaultConfig,
  preExisting: {
    rpcProvider: {
      async request({ method, params }: EIP1193Parameters) {
        const r = await fetch(boot, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
        });
        return ((await r.json()) as { result: unknown }).result;
      },
    },
  },
} as ConstructorParameters<typeof AnonRpcWorker>[0]);

try {
  await worker.ready;
  const client = createPublicClient({
    chain: sepolia,
    transport: http(publicRpc("sepolia"), {
      fetchFn: worker.fetch,
      timeout: 60_000,
      retryCount: 0,
    }),
  });
  let t = now();
  const hash = await client.sendRawTransaction({ serializedTransaction: raw });
  out.broadcastMs = ms(t);
  out.hash = hash;
  out.hashMatches = hash === out.expectedHash;
  t = now();
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 180_000,
    pollingInterval: 4_000,
  });
  out.receipt = {
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    waitMs: ms(t),
  };
} catch (e) {
  out.error = errMsg(e);
} finally {
  worker.close();
}
report(`broadcast-${id}`, out);
