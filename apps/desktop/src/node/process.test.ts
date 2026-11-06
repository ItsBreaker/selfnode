import { describe, expect, it } from "vitest";
import { winQuote } from "./process";

// Windows command-line quoting (CommandLineToArgvW rules) for Start-Process -ArgumentList.
describe("winQuote", () => {
  it("leaves simple arguments alone", () => {
    expect(winQuote("--network=sepolia")).toBe("--network=sepolia");
    expect(winQuote("C:\\Selfnode\\data")).toBe("C:\\Selfnode\\data");
  });
  it("quotes paths with spaces (common in user folders)", () => {
    expect(winQuote("--data-dir=C:\\Users\\Jane Doe\\AppData\\Roaming\\Selfnode")).toBe(
      '"--data-dir=C:\\Users\\Jane Doe\\AppData\\Roaming\\Selfnode"',
    );
  });
  it("doubles trailing backslashes so they don't escape the closing quote", () => {
    expect(winQuote("C:\\Program Files\\x\\")).toBe('"C:\\Program Files\\x\\\\"');
  });
  it("escapes embedded quotes", () => {
    expect(winQuote('a "b" c')).toBe('"a \\"b\\" c"');
    expect(winQuote("")).toBe('""');
  });
});
