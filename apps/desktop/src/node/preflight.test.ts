import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest";
import { diskTooLow, requiredGB, safetyMarginGB } from "./preflight";

const manifest = JSON.parse(
  readFileSync(new URL("../../node-manifest.json", import.meta.url), "utf8"),
) as Manifest;

describe("node pre-flight rules", () => {
  it("uses the clients' published figures plus a growth buffer", () => {
    // Nethermind 212 (state+headers+code) + Nimbus 200 + 4 weeks × 30 GB.
    expect(requiredGB(manifest.disk.sepolia)).toBe(532);
    expect(requiredGB(manifest.disk.mainnet)).toBe(645);
  });
  it("keeps the larger of 50 GB and 10% of the volume free", () => {
    expect(safetyMarginGB(manifest.disk, 256)).toBe(50);
    expect(safetyMarginGB(manifest.disk, 2000)).toBe(200);
  });
  it("would refuse Sepolia on a drive that can't fit it with the margin", () => {
    const need = requiredGB(manifest.disk.sepolia) + safetyMarginGB(manifest.disk, 1000);
    expect(need).toBe(632);
    expect(600 >= need).toBe(false);
  });
  it("pauses below 50 GB or below 10% free", () => {
    expect(diskTooLow({ freeGB: 49, totalGB: 256 }, manifest.disk)).toBe(true);
    expect(diskTooLow({ freeGB: 90, totalGB: 1000 }, manifest.disk)).toBe(true);
    expect(diskTooLow({ freeGB: 150, totalGB: 1000 }, manifest.disk)).toBe(false);
  });
  it("pins only official GitHub release URLs with full SHA-256s", () => {
    for (const c of Object.values(manifest.clients)) {
      for (const b of Object.values(c.platforms)) {
        expect(b?.url).toMatch(
          /^https:\/\/github\.com\/(NethermindEth\/nethermind|status-im\/nimbus-eth2)\/releases\/download\//,
        );
        expect(b?.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(manifest.clients.nimbus.platforms["darwin-arm64"]?.binarySha512).toMatch(
      /^[0-9a-f]{128}$/,
    );
  });
});
