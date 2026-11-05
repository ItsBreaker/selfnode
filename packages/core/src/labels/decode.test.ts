import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { decodeWithCandidates } from "./decode.js";

describe("decodeWithCandidates", () => {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: ["0x2222222222222222222222222222222222222222", 5n],
  });
  it("decodes with the matching candidate, skipping ones that don't parse or fit", () => {
    const d = decodeWithCandidates(data, ["not a signature", "transfer(address,uint256)"]);
    expect(d?.functionName).toBe("transfer");
    expect(d?.args.map((a) => a.type)).toEqual(["address", "uint256"]);
    expect(d?.args[1]?.value).toBe(5n);
  });
  it("returns null when nothing decodes", () => {
    expect(decodeWithCandidates(data, ["foo(uint8,uint8,uint8,bytes)"])).toBeNull();
  });
});
