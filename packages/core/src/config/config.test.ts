import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { anonNetworks, DEFAULT_ANON_NETWORK } from "./anon-rpc.js";
import { chains } from "./chains.js";

describe("config", () => {
  it("has valid specifier addresses", () => {
    for (const n of Object.values(anonNetworks))
      expect(isAddress(n.specifier, { strict: false })).toBe(true);
  });
  it("never defaults to a non-anonymising worker", () => {
    expect(anonNetworks[DEFAULT_ANON_NETWORK].kind).toBe("network");
  });
  it("only marks Sepolia as a testnet", () => {
    expect(chains.mainnet.testnet).toBe(false);
    expect(chains.sepolia.testnet).toBe(true);
  });
  it("proof RPCs are a subset of public RPCs", () => {
    for (const c of Object.values(chains))
      for (const u of c.proofRpcs) expect(c.publicRpcs).toContain(u);
  });
});
