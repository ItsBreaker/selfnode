import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { planBrowse, toBrowseRow, type BrowseRow } from "./browse.js";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const row = (p: Partial<BrowseRow>): BrowseRow => ({
  kind: "labels",
  rowKey: "",
  entityKey: "",
  title: "",
  source: "",
  license: "",
  sourceCommit: "",
  ...p,
});

describe("planBrowse: what runs on Arkiv, what runs on the device", () => {
  it("tokens: symbol prefix (upper-cased) and addresses run on Arkiv", () => {
    const sym = planBrowse({ kind: "tokens", text: "usd" });
    expect(sym.local).toBeNull();
    expect(sym.code).toContain('.where(and(eq("type", "token"), startsWith("symbol", "USD")))');
    const addr = planBrowse({ kind: "tokens", text: WETH });
    expect(addr.code).toContain(`eq("address", "${WETH.toLowerCase()}")`);
    expect(planBrowse({ kind: "tokens", text: "0xc02a" }).code).toContain(
      'startsWith("address", "0xc02a")',
    );
    expect(planBrowse({ kind: "tokens", text: "" }).code).toContain('.where(eq("type", "token"))');
  });

  it("labels: category and address on Arkiv; names on the device", () => {
    const flagged = planBrowse({ kind: "labels", text: "", category: "flagged" });
    expect(flagged.local).toBeNull();
    expect(flagged.code).toContain('and(eq("type", "label"), eq("category", "flagged"))');
    const byName = planBrowse({ kind: "labels", text: "Tornado", category: "contract" });
    expect(byName.code).toContain('and(eq("type", "label"), eq("category", "contract"))');
    expect(byName.code).toContain("filter by text locally");
    expect(byName.local?.(row({ title: "Tornado Cash: Router" }))).toBe(true);
    expect(byName.local?.(row({ title: "Flagged", note: "tornado phishing" }))).toBe(true);
    expect(byName.local?.(row({ title: "Uniswap" }))).toBe(false);
  });

  it("function names: selector on Arkiv; text on the device", () => {
    expect(planBrowse({ kind: "sigs", text: "0xA9059CBB" }).code).toContain(
      'eq("selector", "0xa9059cbb")',
    );
    expect(planBrowse({ kind: "sigs", text: "0xa905" }).code).toContain(
      'startsWith("selector", "0xa905")',
    );
    const t = planBrowse({ kind: "sigs", text: "Swap" });
    expect(t.local?.(row({ kind: "sigs", texts: ["swapExactTokensForETH(uint256)"] }))).toBe(true);
    expect(t.local?.(row({ kind: "sigs", texts: ["transfer(address,uint256)"] }))).toBe(false);
  });

  it("every snippet is standalone, owner-scoped and imports what it uses", () => {
    for (const q of [
      { kind: "tokens" as const, text: "" },
      { kind: "labels" as const, text: "0xabc", category: "flagged" as const },
      { kind: "sigs" as const, text: "0xa9059cbb" },
    ]) {
      const { code } = planBrowse(q);
      expect(code).toContain('.ownedBy("0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39")');
      for (const fn of ["and", "eq", "startsWith"])
        if (code.includes(`${fn}(`)) expect(code).toMatch(new RegExp(`import \\{[^}]*\\b${fn}\\b`));
      expect(code).not.toContain("@selfnode");
    }
  });
});

describe("toBrowseRow", () => {
  const prov = {
    source: { value: "MyEtherWallet/ethereum-lists" },
    license: { value: "MIT" },
    sourceCommit: { value: "8f86cba9b58db79608ece8fa784775b3c41e2e26" },
    rowKey: { value: "x" },
  };
  it("maps tokens, labels (decoding the note) and sigs (decoding the texts)", () => {
    expect(
      toBrowseRow("tokens", {
        $key: "0x01",
        ...prov,
        symbol: { value: "WETH" },
        name: { value: "Wrapped Ether" },
        chain: { value: "1" },
        address: { value: WETH.toLowerCase() },
        decimals: { value: 18 },
      }),
    ).toMatchObject({ title: "WETH", subtitle: "Wrapped Ether", decimals: 18, entityKey: "0x01" });
    expect(
      toBrowseRow("labels", {
        ...prov,
        name: { value: "Flagged by MyEtherWallet's list" },
        category: { value: "flagged" },
        note: { value: stringToHex("Fake airdrop") },
      }),
    ).toMatchObject({ category: "flagged", note: "Fake airdrop", license: "MIT" });
    expect(
      toBrowseRow("sigs", {
        ...prov,
        selector: { value: "0xa9059cbb" },
        text: { value: stringToHex("transfer(address,uint256)") },
        rank: { value: 1 },
      }),
    ).toMatchObject({ title: "0xa9059cbb", texts: ["transfer(address,uint256)"], rank: 1 });
  });
});
