/**
 * Phase 0 spike: Helios (WASM) in the browser with a DIRECT upstream.
 * Its Config accepts only URLs (executionRpc, consensusRpc), so it cannot take
 * Anon-RPC's fetch. Measures lazy-load, sync time and a verified read.
 */
import { createPublicClient, custom } from "viem";
import { report, now, ms, errMsg } from "./report";

const targets = {
  sepolia: {
    executionRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    consensusRpc: "https://lodestar-sepolia.chainsafe.io",
  },
  mainnet: {
    executionRpc: "https://ethereum-rpc.publicnode.com",
    consensusRpc:
      new URLSearchParams(location.search).get("mcl") ?? "https://lodestar-mainnet.chainsafe.io",
  },
} as const;
// A well-known address with a balance on both chains (WETH9 mainnet / Sepolia WETH).
const probe = {
  sepolia: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
} as const;

const results: Record<string, unknown> = {};
let t = now();
const helios = await import("@a16z/helios"); // lazy: WASM only loads here
results.importMs = ms(t);

const only = new URLSearchParams(location.search).get("only");
for (const network of (only ? [only] : ["sepolia", "mainnet"]) as ("sepolia" | "mainnet")[]) {
  const r: Record<string, unknown> = { ...targets[network] };
  try {
    t = now();
    // Weak-subjectivity checkpoint: latest finalized root from the consensus endpoint.
    const hdr = (await (
      await fetch(`${targets[network].consensusRpc}/eth/v1/beacon/headers/finalized`)
    ).json()) as {
      data: { root: string };
    };
    r.checkpoint = hdr.data.root;
    const provider = await helios.createHeliosProvider(
      { ...targets[network], network, checkpoint: hdr.data.root, dbType: "localstorage" },
      "ethereum",
    );
    await Promise.race([
      provider.waitSynced(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("sync timeout 120s")), 120_000)),
    ]);
    r.syncMs = ms(t);
    const client = createPublicClient({ transport: custom(provider) });
    // Helios may report "out of sync" briefly after waitSynced; poll up to 120 s.
    t = now();
    const errors: string[] = [];
    for (;;) {
      try {
        r.blockNumber = (await client.getBlockNumber({ cacheTime: 0 })).toString();
        break;
      } catch (e) {
        errors.push(errMsg(e).split("Details: ")[1]?.split("\n")[0] ?? errMsg(e));
        if (ms(t) > 120_000)
          throw new Error(`still failing: ${errors.slice(-3).join(" | ")}`, { cause: e });
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
    r.retriesBeforeFirstVerifiedRead = errors.length;
    r.lastErrors = errors.slice(-3);
    r.blockNumberMs = ms(t);
    t = now();
    r.verifiedBalanceOfProbe = (await client.getBalance({ address: probe[network] })).toString();
    r.getBalanceMs = ms(t);
  } catch (e) {
    r.error = errMsg(e);
  }
  results[network] = r;
}
report("helios", results);
