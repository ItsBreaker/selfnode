// Regression: Explore showed "Cannot mix BigInt and other types" after the tab
// sat idle. Overview cached { number, timestamp, gasPrice } under the same
// query key Explore read its head from, so whichever polled last won.
import { asBlockNumber, latestBlocks } from "@selfnode/core";
import { QueryClient, QueryObserver, focusManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { exploreHeadQuery, OVERVIEW_HEAD_KEY } from "./queries";

const fakeClient = (head: () => unknown) =>
  ({ getBlockNumber: vi.fn(async () => head()) }) as unknown as PublicClient;

afterEach(() => focusManager.setFocused(undefined));

describe("Explore's head query", () => {
  it("has its own key, not Overview's", () => {
    const k = exploreHeadQuery(
      fakeClient(() => 1n),
      "private:sepolia:nox",
    ).queryKey;
    expect(k[0]).not.toBe(OVERVIEW_HEAD_KEY);
    expect(k[0]).not.toBe("head");
  });

  it("refetching after the tab becomes visible again still gives a bigint usable for block maths", async () => {
    let n = 100n;
    const client = fakeClient(() => n);
    const qc = new QueryClient();
    const opts = exploreHeadQuery(client, "rk");
    const obs = new QueryObserver(qc, {
      ...opts,
      refetchOnWindowFocus: true,
      refetchInterval: false,
    });
    const seen: unknown[] = [];
    const unsub = obs.subscribe((r) => r.data !== undefined && seen.push(r.data));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    // The tab goes to the background, sits idle, then comes back.
    focusManager.setFocused(false);
    n = 105n;
    focusManager.setFocused(true);
    qc.getQueryCache().onFocus();
    await vi.waitFor(() => expect(seen.at(-1)).toBe(105n));
    const head = seen.at(-1) as bigint;
    expect(head - 1n).toBe(104n); // no BigInt mix-up
    unsub();
  });

  it("data restored from a cache as a number, string or another page's object becomes a bigint", async () => {
    for (const restored of [105, "105", "0x69", { number: 105n, timestamp: 1n, gasPrice: 1n }]) {
      const qc = new QueryClient();
      const opts = exploreHeadQuery(
        fakeClient(() => 105n),
        "rk",
      );
      qc.setQueryData(opts.queryKey, restored as never);
      const obs = new QueryObserver(qc, { ...opts, staleTime: Infinity });
      expect(obs.getCurrentResult().data).toBe(105n);
      // And the block list computed from it works.
      const getBlock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({
        number: blockNumber,
        timestamp: 1n,
        transactions: [],
        gasUsed: 0n,
        gasLimit: 1n,
        miner: "0x0000000000000000000000000000000000000000",
      }));
      const rows = await latestBlocks(
        { getBlock } as unknown as PublicClient,
        obs.getCurrentResult().data as bigint,
        3,
      );
      expect(rows.map((r) => r.number)).toEqual([105n, 104n, 103n]);
    }
  });

  it("garbage in the cache is a clear error, not a BigInt mix-up", () => {
    expect(() => asBlockNumber({ hash: "0x1" })).toThrow(/Expected a block number/);
  });
});
