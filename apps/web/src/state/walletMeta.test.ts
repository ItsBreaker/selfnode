import { describe, expect, it } from "vitest";
import { migrateWalletMeta, nextName, type WalletMeta } from "./walletMeta";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

describe("wallet metadata migration (no data loss)", () => {
  it("turns the existing single vault into 'Wallet 1', active", () => {
    expect(migrateWalletMeta(null, { address: A }, ["primary"])).toEqual({
      v: 1,
      accounts: [{ id: "primary-0", name: "Wallet 1", vaultId: "primary", index: 0, address: A }],
      active: "primary-0",
    });
  });
  it("is empty when there's no wallet", () => {
    expect(migrateWalletMeta(null, null, [])).toEqual({ v: 1, accounts: [], active: null });
  });
  it("keeps stored accounts, drops ones whose vault is gone or that are malformed", () => {
    const stored: WalletMeta = {
      v: 1,
      accounts: [
        { id: "primary-0", name: "Main", vaultId: "primary", index: 0, address: A },
        { id: "x-1", name: "Second", vaultId: "x", index: 1, address: B },
        { id: "gone-0", name: "Gone", vaultId: "gone", index: 0, address: B },
        { id: "bad", name: "Bad", vaultId: "x", index: -1, address: B },
      ],
      active: "x-1",
    };
    const m = migrateWalletMeta(stored, { address: A }, ["primary", "x"]);
    expect(m.accounts.map((a) => a.id)).toEqual(["primary-0", "x-1"]);
    expect(m.active).toBe("x-1");
  });
  it("falls back to the first account if the active one is gone", () => {
    const stored = {
      v: 1,
      accounts: [{ id: "primary-0", name: "Main", vaultId: "primary", index: 0, address: A }],
      active: "nope",
    };
    expect(migrateWalletMeta(stored, { address: A }, ["primary"]).active).toBe("primary-0");
  });
  it("never hides the original vault, even if its metadata entry was lost", () => {
    const stored = {
      v: 1,
      accounts: [{ id: "x-0", name: "Other", vaultId: "x", index: 0, address: B }],
      active: "x-0",
    };
    const m = migrateWalletMeta(stored, { address: A }, ["primary", "x"]);
    expect(m.accounts.map((a) => a.id)).toEqual(["primary-0", "x-0"]);
  });
  it("names new wallets after the existing ones", () => {
    expect(nextName([])).toBe("Wallet 1");
    expect(nextName([{ id: "a", name: "Wallet 2", vaultId: "v", index: 0, address: A }])).toBe(
      "Wallet 3",
    );
  });
});
