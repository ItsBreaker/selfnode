/** Phase 0 spike: keyless Arkiv reads from the browser, direct and through Anon-RPC (Nox). */
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { gt } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/schema";
import { http, type EIP1193Parameters } from "viem";
import { anonNetworks, publicRpc } from "@selfnode/core/config/index";
import { report, now, ms, errMsg } from "./report";

const chain = rabdi({ accessKey: "" });
const query = (c: ReturnType<typeof createPublicClient>) =>
  c
    .select({ $key: true, $owner: true })
    .where(gt("$expiresAt", u64(0n)))
    .limit(3)
    .fetch();

const out: Record<string, unknown> = {};
try {
  const t = now();
  const r = await query(createPublicClient({ chain, transport: http() }));
  out.direct = { rows: r.entities.length, ms: ms(t) };
} catch (e) {
  out.direct = { error: errMsg(e) };
}

const net = anonNetworks.nox;
const boot = publicRpc(net.specifierChain);
const worker = new AnonRpcWorker({
  address: net.specifier,
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
    chain,
    transport: http(undefined, { fetchFn: worker.fetch, timeout: 60_000 }),
  });
  let t = now();
  const r = await query(client);
  const first = ms(t);
  t = now();
  await query(client);
  out.viaNox = { rows: r.entities.length, firstMs: first, secondMs: ms(t) };
} catch (e) {
  out.viaNox = { error: errMsg(e) };
} finally {
  worker.close();
}
report("arkiv-anon", out);
