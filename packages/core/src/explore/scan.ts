/**
 * Explorer reads without an indexer: latest blocks and transactions, and an
 * address's recent activity found by scanning the last N blocks. Everything
 * goes through the caller's client (the active route: Anon-RPC in Private
 * mode), with requests issued together so viem batches them.
 *
 * There is no address history beyond the scanned window: a plain node can't
 * list an address's past transactions. That needs an archive node with an
 * index (Erigon/Otterscan-style) or an address index (TrueBlocks' Unchained
 * Index). The UI says so.
 */
import { erc20Abi, type Address, type Hex, type PublicClient } from "viem";

export interface BlockRow {
  number: bigint;
  timestamp: bigint;
  txCount: number;
  gasUsed: bigint;
  gasLimit: bigint;
  miner: Address;
}

export interface TxRow {
  hash: Hex;
  blockNumber: bigint;
  timestamp: bigint;
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
}

export interface TransferRow {
  hash: Hex;
  blockNumber: bigint;
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
  logIndex: number;
}

/**
 * A block number as a bigint, from whatever a caller hands us: a bigint, a
 * safe integer, a decimal or 0x string (what JSON or a cache gives back), or
 * an object with a `number` field (a block). Anything else is a bug in the
 * caller and throws a TypeError naming what it got, instead of failing later
 * with "Cannot mix BigInt and other types".
 */
export function asBlockNumber(v: unknown): bigint {
  if (typeof v === "bigint") {
    if (v < 0n) throw new TypeError(`Block number can't be negative: ${v}`);
    return v;
  }
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^(0x[0-9a-f]+|[0-9]+)$/i.test(v.trim())) return BigInt(v.trim());
  if (v !== null && typeof v === "object" && "number" in v)
    return asBlockNumber((v as { number: unknown }).number);
  throw new TypeError(
    `Expected a block number, got ${v === null ? "null" : typeof v}${typeof v === "object" && v ? ` (${Object.keys(v).join(", ")})` : ""}`,
  );
}

/** A count of blocks or transactions as a positive integer (at least 1). */
const asCount = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new TypeError(`Expected a count, got ${String(n)}`);
  return Math.max(1, Math.floor(v));
};

const range = (from: bigint, count: number) =>
  Array.from({ length: count }, (_, i) => from - BigInt(i)).filter((n) => n >= 0n);

/** The `count` blocks ending at `head` (newest first). */
export async function latestBlocks(
  client: PublicClient,
  headIn: bigint,
  countIn: number,
): Promise<BlockRow[]> {
  const head = asBlockNumber(headIn);
  const count = asCount(countIn);
  const blocks = await Promise.all(
    range(head, count).map((n) => client.getBlock({ blockNumber: n })),
  );
  return blocks.map((b) => ({
    number: asBlockNumber(b.number),
    timestamp: b.timestamp,
    txCount: b.transactions.length,
    gasUsed: b.gasUsed,
    gasLimit: b.gasLimit,
    miner: b.miner,
  }));
}

/** Full blocks (with transactions) from `head` down, `chunk` at a time. */
async function* fullBlocks(client: PublicClient, head: bigint, count: number, chunk = 5) {
  const all = range(head, count);
  for (let i = 0; i < all.length; i += chunk) {
    const part = await Promise.all(
      all
        .slice(i, i + chunk)
        .map((n) => client.getBlock({ blockNumber: n, includeTransactions: true })),
    );
    yield part;
  }
}

const toTx = (
  b: { number: bigint | null; timestamp: bigint },
  t: { hash: Hex; from: Address; to: Address | null; value: bigint; input: Hex },
): TxRow => ({
  hash: t.hash,
  blockNumber: asBlockNumber(b.number),
  timestamp: b.timestamp,
  from: t.from,
  to: t.to,
  value: t.value,
  input: t.input,
});

/**
 * At least `want` of the latest transactions, newest first, reading full
 * blocks from `head` down (at most `maxBlocks`). Returns where it stopped, for
 * "load more".
 */
export async function latestTransactions(
  client: PublicClient,
  headIn: bigint,
  wantIn: number,
  maxBlocksIn = 20,
): Promise<{ txs: TxRow[]; nextBlock: bigint | null }> {
  const head = asBlockNumber(headIn);
  const want = asCount(wantIn);
  const maxBlocks = asCount(maxBlocksIn);
  const txs: TxRow[] = [];
  let last = head;
  // One full block at a time: a busy block already has 100+ transactions.
  for await (const part of fullBlocks(client, head, maxBlocks, 1)) {
    for (const b of part) {
      last = asBlockNumber(b.number);
      // Within a block, later transactions are newer.
      for (const t of [...b.transactions].reverse()) txs.push(toTx(b, t));
    }
    if (txs.length >= want) break;
  }
  return { txs, nextBlock: last > 0n ? last - 1n : null };
}

export interface AddressScan {
  fromBlock: bigint;
  toBlock: bigint;
  txs: TxRow[];
  /** ERC-20 transfers of `tokens` only (public RPCs refuse log queries without a contract address). */
  transfers: TransferRow[];
  /** Set if the log query failed; the transactions are still valid. */
  transfersError?: string;
}

/**
 * An address's activity in the last `blocks` blocks: transactions it sent or
 * received (from full blocks), and ERC-20 Transfer logs to or from it (two
 * eth_getLogs calls). Nothing older is visible this way.
 */
export async function scanAddress(
  client: PublicClient,
  address: Address,
  headIn: bigint,
  blocksIn: number,
  onProgress?: (scanned: number) => void,
  /** Token contracts to look for transfers of (public RPCs require an address filter). */
  tokens: Address[] = [],
): Promise<AddressScan> {
  const head = asBlockNumber(headIn);
  const blocks = asCount(blocksIn);
  const a = address.toLowerCase();
  const span = BigInt(blocks - 1);
  const fromBlock = head > span ? head - span : 0n;
  const transfer = erc20Abi.find((x) => x.type === "event" && x.name === "Transfer");
  if (!transfer || transfer.type !== "event")
    throw new Error("Transfer event missing from erc20Abi");
  const logsP = tokens.length
    ? Promise.all([
        client.getLogs({
          address: tokens,
          event: transfer,
          args: { from: address },
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: tokens,
          event: transfer,
          args: { to: address },
          fromBlock,
          toBlock: head,
        }),
      ]).catch((e: unknown) => e as Error)
    : Promise.resolve([[], []] as const);
  const txs: TxRow[] = [];
  let scanned = 0;
  for await (const part of fullBlocks(client, head, blocks)) {
    for (const b of part) {
      for (const t of b.transactions)
        if (t.from.toLowerCase() === a || t.to?.toLowerCase() === a) txs.push(toTx(b, t));
      scanned++;
    }
    onProgress?.(scanned);
  }
  const logs = await logsP;
  // viem wraps RPC errors; the node's own words are in `details`.
  const transfersError =
    logs instanceof Error
      ? ((logs as Error & { details?: string }).details ??
        logs.message.split("\n")[0] ??
        logs.message)
      : undefined;
  const [sent, received] = logs instanceof Error ? [[], []] : logs;
  const seen = new Set<string>();
  const transfers: TransferRow[] = [];
  for (const l of [...sent, ...received]) {
    const key = `${l.transactionHash}:${l.logIndex}`;
    const { from, to, value } = l.args;
    // ERC-721 Transfers share the topic but index the token id (4 topics); skip them.
    if (seen.has(key) || l.topics.length !== 3 || !from || !to || value === undefined) continue;
    seen.add(key);
    transfers.push({
      hash: l.transactionHash as Hex,
      blockNumber: asBlockNumber(l.blockNumber),
      token: l.address,
      from,
      to,
      amount: value,
      logIndex: Number(l.logIndex),
    });
  }
  const byNewest = <T extends { blockNumber: bigint }>(x: T, y: T) =>
    y.blockNumber > x.blockNumber ? 1 : y.blockNumber < x.blockNumber ? -1 : 0;
  return {
    fromBlock,
    toBlock: head,
    txs: txs.sort(byNewest),
    transfers: transfers.sort(byNewest),
    ...(transfersError ? { transfersError } : {}),
  };
}
