/**
 * Standalone example: fetch a Selfnode dataset snapshot from Swarm, verified
 * against its Arkiv entity. Only needs `@arkiv-network/sdk` and `viem` (plus
 * Node's built-in fetch and crypto). No access key, no wallet, no Selfnode code.
 *
 *   npm i @arkiv-network/sdk viem && npx tsx swarm-read.ts [tokens|labels|sigs]
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { createHash } from "node:crypto";
import { http } from "viem";

// Always scope by this owner: Arkiv is public, so anyone can write look-alike entities.
const MIRROR = "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39";
const GATEWAYS = ["https://bzz.limo", "https://api.gateway.ethswarm.org"];
const dataset = process.argv[2] ?? "sigs";

const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const val = (v: unknown) => (v as { value?: unknown } | undefined)?.value;

// 1. The snapshot entity on Arkiv: where the file is (swarmRef) and what it must hash to.
const { entities } = await arkiv
  .select({
    $key: true,
    rowKey: true,
    swarmRef: true,
    sha256: true,
    rowCount: true,
    createdAt: true,
  })
  .where(and(eq("type", "snapshot"), eq("dataset", dataset)))
  .ownedBy(MIRROR)
  .limit(10)
  .fetch();
const e = entities
  .filter((x) => val((x as Record<string, unknown>).rowKey) === `snapshot:${dataset}`)
  .sort(
    (a, b) =>
      Number(val((b as Record<string, unknown>).createdAt)) -
      Number(val((a as Record<string, unknown>).createdAt)),
  )[0] as Record<string, unknown> | undefined;
if (!e) throw new Error(`No snapshot entity for ${dataset}`);
const swarmRef = String(val(e.swarmRef));
const sha256 = String(val(e.sha256));
console.log(`Arkiv entity ${String(e.$key)}`);
console.log(`  swarmRef ${swarmRef}`);
console.log(`  sha256   ${sha256}, ${String(val(e.rowCount))} rows`);

// 2. Download from Swarm; accept only bytes with that SHA-256.
for (const g of GATEWAYS) {
  try {
    const res = await fetch(`${g}/bzz/${swarmRef}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== sha256) throw new Error(`SHA-256 mismatch (${got})`);
    const snap = JSON.parse(new TextDecoder().decode(bytes)) as {
      format: string;
      rowCount: number;
      rows: { rowKey: string }[];
      sources: { source: string; sourceCommit: string; license: string }[];
    };
    console.log(`Downloaded ${bytes.length} bytes from ${g}; SHA-256 matches the Arkiv entity`);
    console.log(`  ${snap.format}: ${snap.rowCount} rows, e.g. ${snap.rows[0]?.rowKey}`);
    for (const s of snap.sources)
      console.log(`  source ${s.source}@${s.sourceCommit.slice(0, 7)} (${s.license})`);
    process.exit(0);
  } catch (err) {
    console.log(`  ${g}: ${(err as Error).message}; trying the next gateway`);
  }
}
throw new Error("No gateway served the snapshot with the expected SHA-256");
