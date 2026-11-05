/**
 * Rank function selectors by real usage: count the 4-byte selector of every
 * transaction's calldata in a sample of recent mainnet blocks. Top-level calls
 * only (internal calls would need traces). Results are cached so a re-run
 * doesn't re-sample. The sample is read from a public RPC directly: it's a
 * build step reading public blocks, not a user action.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const CACHE = new URL("./.cache/", import.meta.url);

export interface UsageSample {
  fromBlock: string;
  toBlock: string;
  blocks: number;
  txs: number;
  callsWithSelector: number;
  sampledAt: string;
  counts: Record<string, number>;
}

export async function sampleUsage(
  blocks: number,
  rpc = "https://ethereum-rpc.publicnode.com",
): Promise<UsageSample> {
  const file = new URL(`usage-${blocks}.json`, CACHE);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as UsageSample;
    if (Date.now() - Date.parse(cached.sampledAt) < 7 * 86_400_000) return cached;
  }
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpc, { batch: { batchSize: 10 }, retryCount: 4 }),
  });
  const head = await client.getBlockNumber();
  const counts: Record<string, number> = {};
  let txs = 0;
  let calls = 0;
  const numbers = Array.from({ length: blocks }, (_, i) => head - BigInt(i));
  for (let i = 0; i < numbers.length; i += 10) {
    const batch = await Promise.all(
      numbers
        .slice(i, i + 10)
        .map((n) => client.getBlock({ blockNumber: n, includeTransactions: true })),
    );
    for (const b of batch) {
      for (const tx of b.transactions) {
        txs++;
        if (tx.to && tx.input.length >= 10) {
          calls++;
          const sel = tx.input.slice(0, 10).toLowerCase();
          counts[sel] = (counts[sel] ?? 0) + 1;
        }
      }
    }
    process.stdout.write(`\r  sampled ${Math.min(i + 10, blocks)}/${blocks} blocks`);
  }
  process.stdout.write("\n");
  const sample: UsageSample = {
    fromBlock: (head - BigInt(blocks - 1)).toString(),
    toBlock: head.toString(),
    blocks,
    txs,
    callsWithSelector: calls,
    sampledAt: new Date().toISOString(),
    counts,
  };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(sample));
  return sample;
}
