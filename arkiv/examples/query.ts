/**
 * Standalone example: query Selfnode's Arkiv mirror from any app.
 * Only needs `@arkiv-network/sdk` and `viem`. No access key, no Selfnode code.
 *
 *   npm i @arkiv-network/sdk viem && npx tsx query.ts
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { hexToString, http } from "viem";

// Always scope by this owner: Arkiv is public, so anyone can write look-alike entities.
const MIRROR = "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39";
const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });

/** `str` attributes come back as { value: string }; `bytes` ones as hex. */
const s = (v: unknown) => (v as { value?: string } | undefined)?.value ?? "";
const b = (v: unknown) => {
  const x = s(v);
  return x.startsWith("0x") ? hexToString(x as `0x${string}`) : x;
};

// 1. Label for an address (contract name, token, or "Flagged by MyEtherWallet's list").
async function labelFor(chainId: number, address: string) {
  const { entities } = await arkiv
    .select({ name: true, category: true, note: true, source: true, sourceCommit: true })
    .where(
      and(eq("type", "label"), eq("chain", String(chainId)), eq("address", address.toLowerCase())),
    )
    .ownedBy(MIRROR)
    .limit(1)
    .fetch();
  const e = entities[0];
  return e
    ? {
        name: s(e.name),
        category: s(e.category),
        note: b(e.note),
        source: `${s(e.source)}@${s(e.sourceCommit).slice(0, 7)}`,
      }
    : null;
}

// 2. Token by symbol (may match several contracts; check the address you expect).
async function tokensBySymbol(chainId: number, symbol: string) {
  const { entities } = await arkiv
    .select({ address: true, name: true, decimals: true, source: true })
    .where(and(eq("type", "token"), eq("chain", String(chainId)), eq("symbol", symbol)))
    .ownedBy(MIRROR)
    .limit(10)
    .fetch();
  return entities.map((e) => ({
    address: s(e.address),
    name: s(e.name),
    decimals: Number(s(e.decimals)),
    source: s(e.source),
  }));
}

// 3. Function name(s) for a 4-byte selector (collisions are ";"-separated candidates).
async function functionNames(selector: string) {
  const { entities } = await arkiv
    .select({ text: true, rank: true, source: true })
    .where(and(eq("type", "sig"), eq("selector", selector.toLowerCase())))
    .ownedBy(MIRROR)
    .limit(1)
    .fetch();
  const e = entities[0];
  return e
    ? { candidates: b(e.text).split(";"), rank: Number(s(e.rank)), source: s(e.source) }
    : null;
}

console.log("label:", await labelFor(1, "0x09750ad360fdb7a2ee23669c4503c974d86d8694"));
console.log("tokens:", await tokensBySymbol(1, "USDC"));
console.log("selector:", await functionNames("0xa9059cbb"));
