import { isAddress, isHex, type PublicClient } from "viem";
import { normalize } from "viem/ens";

export type SearchTarget =
  | { kind: "address"; value: string }
  | { kind: "tx"; value: string }
  | { kind: "block"; value: string }
  | { kind: "ens"; value: string }
  | { kind: "invalid"; reason: string };

/** Classify what the user typed. Pure, so it's easy to test. */
export function classify(input: string): SearchTarget {
  const q = input.trim();
  if (!q)
    return {
      kind: "invalid",
      reason: "Type an address, transaction hash, block number or ENS name",
    };
  if (isAddress(q, { strict: false })) return { kind: "address", value: q };
  if (isHex(q) && q.length === 66) return { kind: "tx", value: q.toLowerCase() };
  if (/^\d{1,12}$/.test(q.replace(/[,_\s]/g, "")))
    return { kind: "block", value: q.replace(/[,_\s]/g, "") };
  if (/^[^\s]+\.[a-z]{2,}$/i.test(q)) return { kind: "ens", value: q.toLowerCase() };
  return {
    kind: "invalid",
    reason: "That doesn't look like an address, transaction hash, block number or ENS name",
  };
}

/** Resolve an ENS name through the active route. */
export async function resolveEns(client: PublicClient, name: string): Promise<string | null> {
  return client.getEnsAddress({ name: normalize(name) });
}
