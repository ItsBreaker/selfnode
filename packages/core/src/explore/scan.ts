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

const range = (from: bigint, count: number) =>
  Array.from({ length: count }, (_, i) => from - BigInt(i)).filter((n) => n >= 0n);

/** The `count` blocks ending at `head` (newest first). */
export async function latestBlocks(
  client: PublicClient,
  head: bigint,
  count: number,
): Promise<BlockRow[]> {
  const blocks = await Promise.all(
    range(head, count).map((n) => client.getBlock({ blockNumber: n })),
  );
  return blocks.map((b) => ({
    number: b.number as bigint,
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
  blockNumber: b.number as bigint,
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
  head: bigint,
  want: number,
  maxBlocks = 20,
): Promise<{ txs: TxRow[]; nextBlock: bigint | null }> {
  const txs: TxRow[] = [];
  let last = head;
  // One full block at a time: a busy block already has 100+ transactions.
  for await (const part of fullBlocks(client, head, maxBlocks, 1)) {
    for (const b of part) {
      last = b.number as bigint;
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
  head: bigint,
  blocks: number,
  onProgress?: (scanned: number) => void,
  /** Token contracts to look for transfers of (public RPCs require an address filter). */
  tokens: Address[] = [],
): Promise<AddressScan> {
  const a = address.toLowerCase();
  const fromBlock = head - BigInt(Math.max(1, blocks) - 1) > 0n ? head - BigInt(blocks - 1) : 0n;
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
      blockNumber: l.blockNumber as bigint,
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
