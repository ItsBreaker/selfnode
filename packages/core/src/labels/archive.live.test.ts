/** Live: the pinned snapshots on Swarm load and verify (run explicitly; hits bzz.limo). */
import { describe, expect, it } from "vitest";
import { loadArchive, PINNED_SNAPSHOTS } from "./archive.js";

describe("Swarm archive (live)", () => {
  it("downloads and verifies the pinned snapshots from bzz.limo", async () => {
    const a = await loadArchive({
      fetchFn: fetch,
      pointersFromArkiv: async () => [...PINNED_SNAPSHOTS],
    });
    expect(a.index.counts).toEqual({ tokens: 2105, labels: 796, sigs: 444 });
    expect(a.index.signature("0xa9059cbb")?.texts).toContain("transfer(address,uint256)");
    expect(a.index.label(1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")?.symbol).toBe("WETH");
  }, 120_000);
});
