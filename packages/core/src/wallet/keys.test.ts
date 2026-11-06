import { describe, expect, it } from "vitest";
import { addressOf, derivationPath, InvalidKeyError, privateKeyFromMnemonic } from "./keys.js";

// The well-known public test phrase (Hardhat/Anvil); never holds real funds.
const TEST = "test test test test test test test test test test test junk";

describe("accounts from one recovery phrase", () => {
  it("derives the standard path per index", () => {
    expect(derivationPath(0)).toBe("m/44'/60'/0'/0/0");
    expect(derivationPath(3)).toBe("m/44'/60'/0'/0/3");
    expect(() => derivationPath(-1)).toThrow(InvalidKeyError);
    expect(() => derivationPath(1.5)).toThrow(InvalidKeyError);
  });
  it("matches the published addresses for accounts 0 and 1", async () => {
    expect(addressOf(await privateKeyFromMnemonic(TEST))).toBe(
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    expect(addressOf(await privateKeyFromMnemonic(TEST, 1))).toBe(
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    );
  });
});
