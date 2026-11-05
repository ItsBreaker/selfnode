import { describe, expect, it } from "vitest";
import { classify } from "./search";

describe("explorer search", () => {
  it("classifies inputs", () => {
    expect(classify("0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14").kind).toBe("address");
    expect(classify(`0x${"ab".repeat(32)}`).kind).toBe("tx");
    expect(classify("12,071,991")).toEqual({ kind: "block", value: "12071991" });
    expect(classify("vitalik.eth")).toEqual({ kind: "ens", value: "vitalik.eth" });
    expect(classify("hello").kind).toBe("invalid");
    expect(classify("").kind).toBe("invalid");
  });
});
