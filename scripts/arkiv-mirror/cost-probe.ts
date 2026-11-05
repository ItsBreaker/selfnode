/**
 * Measures what Arkiv writes cost in tGLM: create at 1, 30 and 90 days, then
 * extend and patch. Uses a throwaway schema; probe entities expire in ≤ 90 days.
 * usage: pnpm --filter @selfnode/scripts arkiv:cost
 */
import { ExpirationTime } from "@arkiv-network/sdk";
import { defineSchema, str } from "@arkiv-network/sdk/schema";
import { formatEther } from "viem";
import { account, reader, redact, writer } from "./client.js";

const Probe = defineSchema("selfnode-costprobe", {
  type: str().indexed(),
  rowKey: str().indexed(),
  address: str().indexed(),
  name: str(),
  source: str(),
  license: str(),
  sourceCommit: str(),
  contentHash: str(),
});
const N = 20;
const row = (i: number, tag: string) => ({
  type: "costprobe",
  rowKey: `probe:${tag}:${i}`,
  address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
  name: `Probe entity ${i} with a realistic label length`,
  source: "MyEtherWallet/ethereum-lists",
  license: "MIT",
  sourceCommit: "8f86cba9b58db79608ece8fa784775b3c41e2e26",
  contentHash: "0".repeat(64),
});

async function measure(label: string, op: () => Promise<{ txHash: `0x${string}` }>) {
  const before = await reader.getBalance({ address: account.address });
  const t = performance.now();
  const { txHash } = await op();
  const receipt = await reader.getTransactionReceipt({ hash: txHash });
  const after = await reader.getBalance({ address: account.address });
  const spent = before - after;
  console.log(
    `${label.padEnd(34)} spent ${formatEther(spent).padEnd(22)} tGLM  per entity ${formatEther(spent / BigInt(N)).padEnd(22)} gas ${receipt.gasUsed} (${Math.round(performance.now() - t)} ms)`,
  );
  return spent;
}

try {
  console.log(
    "mirror wallet",
    account.address,
    "balance",
    formatEther(await reader.getBalance({ address: account.address })),
    "tGLM",
  );
  const results: Record<string, bigint> = {};
  let keys30: `0x${string}`[] = [];
  for (const days of [1, 30, 90]) {
    results[`create${days}`] = await measure(`create ${N} @ ${days}d`, async () => {
      const r = await writer.executeBatch({
        creates: Array.from({ length: N }, (_, i) => ({
          schema: Probe,
          values: row(i, `d${days}`),
          expiration: ExpirationTime.fromDays(days),
        })),
      } as never);
      if (days === 30) keys30 = r.createdEntities;
      return r;
    });
  }
  await measure(`extend ${N} by 30d`, () =>
    writer.executeBatch({
      extensions: keys30.map((entityKey) => ({
        entityKey,
        expiration: ExpirationTime.fromDays(60),
      })),
    } as never),
  );
  await measure(`patch ${N} (one attribute)`, () =>
    writer.executeBatch({
      patches: keys30.map((entityKey) => ({
        schema: Probe,
        entityKey,
        set: { name: "patched name" },
      })),
    } as never),
  );
  console.log(
    "balance now",
    formatEther(await reader.getBalance({ address: account.address })),
    "tGLM",
  );
} catch (e) {
  console.error("FAILED:", redact(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  process.exit(1);
}
