import { describe, expect, it } from "vitest";
import { isSynced } from "./manager";

const ex = { syncing: false, peers: 8, currentBlock: 12_100_000 };
const cs = { syncing: false };

describe("when the node counts as synced (triggers the switch to local reads)", () => {
  it("is synced when both clients are done, have peers and the head is fresh", () => {
    expect(isSynced(ex, cs, 12)).toBe(true);
  });
  it("is not synced while either client is still syncing", () => {
    expect(isSynced({ ...ex, syncing: true }, cs, 12)).toBe(false);
    expect(isSynced(ex, { syncing: true }, 12)).toBe(false);
  });
  it("is not synced with a stale head, even if the client says it isn't syncing", () => {
    expect(isSynced(ex, cs, 600)).toBe(false);
    expect(isSynced(ex, cs, null)).toBe(false);
  });
  it("is not synced without peers or before the first block", () => {
    expect(isSynced({ ...ex, peers: 0 }, cs, 12)).toBe(false);
    expect(isSynced({ ...ex, currentBlock: 0 }, cs, 12)).toBe(false);
    expect(
      isSynced({ syncing: null, peers: null, currentBlock: null }, { syncing: null }, null),
    ).toBe(false);
  });
});
