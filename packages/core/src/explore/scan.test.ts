import { createPublicClient, custom, pad, toHex, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { asBlockNumber, latestBlocks, latestTransactions, scanAddress } from "./scan.js";

const A = "0x00000000000000000000000000000000000000aa" as Address;
const B = "0x00000000000000000000000000000000000000bb" as Address;
const T = "0x00000000000000000000000000000000000000cc" as Address; // a token
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const h = (n: number) => pad(toHex(n), { size: 32 });

/** Blocks 1..5; block n has transactions per this table. */
const TXS: Record<number, { from: Address; to: Address | null; value: number }[]> = {
  1: [{ from: A, to: B, value: 1 }],
  2: [{ from: B, to: B, value: 2 }],
  3: [
    { from: B, to: A, value: 3 },
    { from: B, to: null, value: 0 },
  ],
  4: [],
  5: [{ from: A, to: T, value: 0 }],
};
const tx = (n: number, i: number) => {
  const t = TXS[n]?.[i];
  if (!t) throw new Error("no tx");
  return {
    hash: h(n * 100 + i),
    blockNumber: toHex(n),
    blockHash: h(n),
    transactionIndex: toHex(i),
    from: t.from,
    to: t.to,
    value: toHex(t.value),
    input: "0x",
    nonce: "0x0",
    gas: "0x5208",
    gasPrice: "0x1",
    type: "0x0",
    v: "0x1b",
    r: h(1),
    s: h(2),
    chainId: "0xaa36a7",
  };
};
const block = (n: number, full: boolean) => ({
  number: toHex(n),
  hash: h(n),
  parentHash: h(Math.max(0, n - 1)),
  timestamp: toHex(1000 + n * 12),
  miner: B,
  gasUsed: toHex(21000 * (TXS[n]?.length ?? 0)),
  gasLimit: "0x1c9c380",
  baseFeePerGas: "0x1",
  transactions: (TXS[n] ?? []).map((_, i) => (full ? tx(n, i) : h(n * 100 + i))),
  nonce: "0x0000000000000000",
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x1",
  sha3Uncles: h(0),
  logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: h(0),
  stateRoot: h(0),
  receiptsRoot: h(0),
  mixHash: h(0),
  uncles: [],
});
const log = (n: number, from: Address, to: Address, amount: number, extraTopic = false) => ({
  address: T,
  blockNumber: toHex(n),
  blockHash: h(n),
  transactionHash: h(n * 100),
  transactionIndex: "0x0",
  logIndex: "0x0",
  removed: false,
  data: extraTopic ? "0x" : pad(toHex(amount), { size: 32 }),
  topics: [TRANSFER, pad(from), pad(to), ...(extraTopic ? [h(7)] : [])],
});
const LOGS = [log(5, A, B, 50), log(2, B, A, 20), log(4, A, B, 1, true) /* ERC-721 */];
const calls: string[] = [];
const client = createPublicClient({
  transport: custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      calls.push(method);
      if (method === "eth_getBlockByNumber") {
        const [n, full] = params as [string, boolean];
        return block(Number(n), full);
      }
      if (method === "eth_getLogs") {
        const f = (
          params as [{ fromBlock: string; toBlock: string; topics: (string | null)[] }]
        )[0];
        return LOGS.filter((l) => {
          const n = Number(l.blockNumber);
          if (n < Number(f.fromBlock) || n > Number(f.toBlock)) return false;
          return f.topics.every(
            (t, i) =>
              t === null || t === undefined || l.topics[i]?.toLowerCase() === t.toLowerCase(),
          );
        });
      }
      throw new Error(`unexpected ${method}`);
    },
  }),
});

describe("explorer reads without an indexer", () => {
  it("latest blocks: newest first, with tx count, gas and fee recipient", async () => {
    const b = await latestBlocks(client, 5n, 3);
    expect(b.map((x) => x.number)).toEqual([5n, 4n, 3n]);
    expect(b[2]).toMatchObject({ txCount: 2, gasUsed: 42000n, miner: B });
  });

  it("latest transactions: newest first, and where to continue for 'load more'", async () => {
    // Blocks are read one at a time (5, 4, 3) until there are enough.
    const r = await latestTransactions(client, 5n, 2);
    expect(r.txs.map((t) => [t.blockNumber, t.value])).toEqual([
      [5n, 0n],
      [3n, 0n],
      [3n, 3n],
    ]);
    expect(r.nextBlock).toBe(2n);
  });

  it("address scan: only this address, only the window, ERC-20 only, newest first", async () => {
    const s = await scanAddress(client, A, 5n, 4, undefined, [T]); // blocks 2–5
    expect([s.fromBlock, s.toBlock]).toEqual([2n, 5n]);
    // Block 1's A→B is outside the window; block 3's B→A and block 5's A→T are in.
    expect(s.txs.map((t) => t.blockNumber)).toEqual([5n, 3n]);
    // The ERC-721 transfer in block 4 is skipped.
    expect(
      s.transfers.map((t) => [t.blockNumber, t.from.toLowerCase(), t.to.toLowerCase(), t.amount]),
    ).toEqual([
      [5n, A, B, 50n],
      [2n, B, A, 20n],
    ]);
  });

  it("asks for logs only with a token address, and keeps the transactions if logs fail", async () => {
    calls.length = 0;
    const none = await scanAddress(client, A, 5n, 4);
    expect(calls).not.toContain("eth_getLogs");
    expect(none.transfers).toEqual([]);
    const failing = createPublicClient({
      transport: custom({
        async request(args: { method: string; params?: unknown[] }) {
          if (args.method === "eth_getLogs")
            throw new Error("Please specify an address in your request");
          return (
            client.transport as unknown as { request: (a: unknown) => Promise<unknown> }
          ).request(args);
        },
      }),
    });
    const s = await scanAddress(failing, A, 5n, 4, undefined, [T]);
    expect(s.txs.length).toBe(2);
    expect(s.transfersError).toMatch(/specify an address/);
  });

  it("never asks for blocks below 0", async () => {
    const s = await scanAddress(client, A, 2n, 50);
    expect(s.fromBlock).toBe(0n);
  });
});

// Regression: "Cannot mix BigInt and other types" on Explore after the tab sat
// idle. Another page cached a different shape under the same query key, and a
// cache or JSON round trip turns bigints into numbers or strings.
describe("block numbers from caches and storage", () => {
  it("accepts bigint, safe numbers, decimal and hex strings, and blocks", () => {
    expect(asBlockNumber(5n)).toBe(5n);
    expect(asBlockNumber(5)).toBe(5n);
    expect(asBlockNumber("5")).toBe(5n);
    expect(asBlockNumber("0x5")).toBe(5n);
    expect(asBlockNumber({ number: 5n, timestamp: 1n, gasPrice: 1n })).toBe(5n);
    expect(asBlockNumber({ number: "0x5" })).toBe(5n);
  });

  it("names what it got instead of failing with a BigInt mix-up", () => {
    expect(() => asBlockNumber(undefined)).toThrow(/Expected a block number, got undefined/);
    expect(() => asBlockNumber(1.5)).toThrow(TypeError);
    expect(() => asBlockNumber({ hash: "0x1" })).toThrow(/got object \(hash\)/);
    expect(() => asBlockNumber(-1n)).toThrow(/negative/);
  });

  it("latest blocks and transactions work with a head restored as a number, string or block", async () => {
    const want = (await latestBlocks(client, 5n, 3)).map((b) => b.number);
    for (const head of [5, "5", "0x5", { number: 5n, timestamp: 1n, gasPrice: 1n }]) {
      const rows = await latestBlocks(client, head as unknown as bigint, 3);
      expect(rows.map((b) => b.number)).toEqual(want);
      const { txs, nextBlock } = await latestTransactions(client, head as unknown as bigint, 2);
      expect(typeof nextBlock).toBe("bigint");
      expect(txs.every((t) => typeof t.blockNumber === "bigint")).toBe(true);
    }
  });

  it("an address scan with a restored head and a string window", async () => {
    const r = await scanAddress(client, A, "5" as unknown as bigint, "3" as unknown as number);
    expect(r.fromBlock).toBe(3n);
    expect(r.toBlock).toBe(5n);
  });
});
