/**
 * Phase 0 spike: write one entity to Arkiv (Rabdi) with the mirror wallet and
 * read it back WITHOUT a key, scoped by owner.
 *
 * The access key is sent only in the X-API-KEY header (never in the URL path),
 * and is never printed: any error text is redacted before it's logged.
 */
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { defineSchema, str } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const accessKey = process.env.ARKIV_ACCESS_KEY ?? "";
const pk = process.env.ARKIV_MIRROR_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk || !accessKey)
  throw new Error("ARKIV_MIRROR_PRIVATE_KEY and ARKIV_ACCESS_KEY must be set in .env");
const redact = (s: string) => (accessKey ? s.split(accessKey).join("[redacted]") : s);

const chain = rabdi({ accessKey: "" }); // URL without a key in the path
const account = privateKeyToAccount(pk);
const writer = createWalletClient({
  chain,
  account,
  transport: http(undefined, { fetchOptions: { headers: { "X-API-KEY": accessKey } } }),
});
const reader = createPublicClient({ chain, transport: http() }); // keyless

const Spike = defineSchema("selfnode-spike", { kind: str().indexed(), note: str() });

try {
  let t = performance.now();
  const { entityKey, txHash } = await writer.createEntity(
    Spike,
    { kind: "phase0", note: `Selfnode Phase 0 write test ${new Date().toISOString()}` },
    { expiration: ExpirationTime.fromDays(1) },
  );
  console.log("owner    ", account.address);
  console.log("entityKey", entityKey);
  console.log("txHash   ", txHash, `(${Math.round(performance.now() - t)} ms incl. inclusion)`);

  t = performance.now();
  const byKey = await reader.getEntity(entityKey, Spike);
  console.log("getEntity (keyless):", byKey.note.value, `${Math.round(performance.now() - t)} ms`);

  t = performance.now();
  const rows = await reader
    .select({ $key: true, $expiresAt: true, note: true })
    .from(Spike)
    .where(eq("kind", "phase0"))
    .ownedBy(account.address)
    .limit(10)
    .fetch();
  console.log(
    `query ownedBy (keyless): ${rows.entities.length} row(s) ${Math.round(performance.now() - t)} ms`,
  );
  console.log(
    "  found written entity:",
    rows.entities.some((r) => r.$key === entityKey),
  );
} catch (e) {
  console.error("FAILED:", redact(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  process.exit(1);
}
