/**
 * Phase 0 spike: can Arkiv (Rabdi testnet) be read WITHOUT an access key,
 * scoped by owner? This is what the public web app would do.
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { gt } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAddress } from "viem/accounts";

process.loadEnvFile?.(new URL("../../.env", import.meta.url).pathname);
const mirrorKey = process.env.ARKIV_MIRROR_PRIVATE_KEY as `0x${string}` | undefined;
const owner = mirrorKey ? privateKeyToAddress(mirrorKey) : undefined;

const chain = rabdi({ accessKey: "" }); // deliberately keyless
const client = createPublicClient({ chain, transport: http(undefined, { retryCount: 0 }) });

const t = () => performance.now();
let t0 = t();
console.log("chainId", await client.getChainId(), `${Math.round(t() - t0)}ms`);
console.log(
  "mirror owner",
  owner,
  "balance (wei)",
  owner ? await client.getBalance({ address: owner }) : "n/a",
);

// Any entities at all (unscoped, just to prove reads work keyless).
t0 = t();
const any = await client
  .select({ $key: true, $owner: true })
  .where(gt("$expiresAt", u64(0n)))
  .limit(3)
  .fetch();
console.log("unscoped read:", any.entities.length, "rows", `${Math.round(t() - t0)}ms`);
const someOwner = any.entities[0]?.$owner;

// Scoped by owner (the pattern the app will use).
if (someOwner) {
  t0 = t();
  const scoped = await client.select({ $key: true }).ownedBy(someOwner).limit(5).fetch();
  console.log(
    "ownedBy(",
    someOwner,
    "):",
    scoped.entities.length,
    "rows",
    `${Math.round(t() - t0)}ms`,
  );
}

// Burst: 30 sequential + 30 parallel reads to probe the public rate limit.
let ok = 0,
  fail = 0;
const errs = new Set<string>();
t0 = t();
for (let i = 0; i < 30; i++) {
  try {
    await client
      .select({ $key: true })
      .where(gt("$expiresAt", u64(0n)))
      .limit(1)
      .fetch();
    ok++;
  } catch (e) {
    fail++;
    errs.add(String(e).slice(0, 120));
  }
}
console.log(`sequential x30: ok=${ok} fail=${fail} in ${Math.round(t() - t0)}ms`);
ok = 0;
fail = 0;
t0 = t();
await Promise.all(
  Array.from({ length: 30 }, async () => {
    try {
      await client
        .select({ $key: true })
        .where(gt("$expiresAt", u64(0n)))
        .limit(1)
        .fetch();
      ok++;
    } catch (e) {
      fail++;
      errs.add(String(e).slice(0, 120));
    }
  }),
);
console.log(`parallel x30: ok=${ok} fail=${fail} in ${Math.round(t() - t0)}ms`);
if (errs.size) console.log("errors:", [...errs]);
