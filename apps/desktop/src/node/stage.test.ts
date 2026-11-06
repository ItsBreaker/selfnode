import { describe, expect, it } from "vitest";
import {
  describeNethermind,
  describeNimbus,
  emptyNethermindView,
  readNethermindLine,
  type NethermindLogView,
} from "./stage";

const feed = (lines: string[]): NethermindLogView =>
  lines.reduce(readNethermindLine, emptyNethermindView());
// What eth_syncing says during snap sync: no block progress at all.
const snapRpc = { syncing: true, currentBlock: 0, highestBlock: 12_077_300 };

describe("Nethermind stage", () => {
  it("doesn't pretend to know before the client says anything", () => {
    expect(describeNethermind(emptyNethermindView(), snapRpc)).toEqual({
      label: "Syncing",
      detail: "waiting for Nethermind to report its stage",
    });
  });

  it("names the stage from 'Sync mode changed', ranking state over headers", () => {
    const v = feed([
      "06 Nov 20:31:02 | Sync mode changed from Disconnected to FastHeaders, SnapSync",
    ]);
    expect(describeNethermind(v, snapRpc)).toEqual({
      label: "Syncing state (snap)",
      detail: "also downloading headers",
    });
  });

  it("shows snap progress only as the percentage Nethermind printed", () => {
    const v = feed([
      "Sync mode changed from Disconnected to SnapSync",
      "Snap         State Ranges (Phase 1 of 2): ( 12.34 %) [====      ]",
    ]);
    expect(describeNethermind(v, snapRpc)).toMatchObject({
      label: "Syncing state (snap)",
      percent: 12.34,
    });
  });

  it("adds header progress when headers are downloading too", () => {
    const v = feed([
      "Sync mode changed from None to BeaconHeaders, SnapSync",
      "Beacon Headers 1,204,000 / 12,077,300 (  9.97 %) | queue 0 | current 4,100 Blk/s",
    ]);
    expect(describeNethermind(v, snapRpc)?.detail).toBe(
      "also downloading headers 1,204,000 / 12,077,300",
    );
  });

  it("moves to healing after phase 1 finishes", () => {
    const v = feed([
      "Sync mode changed from Disconnected to SnapSync",
      "Snap         State Ranges (Phase 1 of 2): ( 99.90 %)",
      "Snap - State Ranges (Phase 1 of 2) finished.",
      "State Sync (Phase 2 of 2, healing) 00:01:12 | nodes 1,234",
    ]);
    expect(describeNethermind(v, snapRpc)).toMatchObject({
      label: "Syncing state (healing)",
      detail: "phase 2 of 2",
    });
  });

  it("reports catching up blocks, then synced", () => {
    const v = feed(["Sync mode changed from StateNodes to Full"]);
    expect(
      describeNethermind(v, { syncing: true, currentBlock: 12_070_000, highestBlock: 12_077_300 }),
    ).toEqual({ label: "Catching up blocks" });
    expect(
      describeNethermind(v, { syncing: false, currentBlock: 12_077_300, highestBlock: 12_077_300 }),
    ).toEqual({ label: "Synced" });
  });

  it("says when it's waiting for peers, and shows modes it doesn't know as-is", () => {
    expect(describeNethermind(feed(["Waiting for peers... 0 peers"]), snapRpc)?.label).toBe(
      "Waiting for peers",
    );
    expect(
      describeNethermind(feed(["Sync mode changed from Full to SomethingNew"]), snapRpc)?.detail,
    ).toBe("mode SomethingNew");
  });

  it("ignores unrelated lines", () => {
    const v = emptyNethermindView();
    expect(readNethermindLine(v, "Peers: 7 | node diversity : ...")).toBe(v);
  });
});

describe("Nimbus stage", () => {
  it("covers the beacon API states", () => {
    expect(describeNimbus(null)).toBeNull();
    expect(describeNimbus({ is_syncing: true, sync_distance: "1234" })).toEqual({
      label: "Syncing the beacon chain",
      detail: "1,234 slots behind",
    });
    // What the user's node reports right now: at the head, but optimistic.
    expect(
      describeNimbus({
        is_syncing: false,
        sync_distance: "0",
        is_optimistic: true,
        el_offline: false,
      }),
    ).toEqual({
      label: "Following the chain",
      detail: "optimistic until Nethermind finishes syncing",
    });
    expect(describeNimbus({ is_syncing: false, sync_distance: "0", el_offline: true })?.label).toBe(
      "Waiting for Nethermind",
    );
    expect(describeNimbus({ is_syncing: false, sync_distance: "0", is_optimistic: false })).toEqual(
      { label: "Synced" },
    );
  });
});
