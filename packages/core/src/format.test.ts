import { describe, expect, it } from "vitest";
import { formatAmount, formatDuration, shortHex } from "./format.js";

describe("format", () => {
  it("shortens and checksums addresses", () => {
    expect(shortHex("0xfff9976782d46cc05630d1f6ebab18b2324d6b14")).toBe("0xfFf9…6B14");
    expect(shortHex(`0x${"ab".repeat(32)}`, 6)).toBe("0xababab…ababab");
  });
  it("formats amounts exactly, without floating point", () => {
    expect(formatAmount(1234500000000000000000n, 18)).toEqual({
      whole: "1,234",
      fraction: "5",
      truncated: false,
      exact: "1234.5",
    });
    expect(formatAmount(1n, 18).truncated).toBe(true);
    expect(formatAmount(123456789n, 6, 2)).toMatchObject({
      whole: "123",
      fraction: "45",
      truncated: true,
    });
    expect(formatAmount(0n, 18)).toMatchObject({ whole: "0", fraction: "" });
    expect(formatAmount(-1500000n, 6).whole).toBe("−1");
  });
  it("formats durations", () => {
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(1234)).toBe("1.2 s");
    expect(formatDuration(13120)).toBe("13 s");
  });
});
