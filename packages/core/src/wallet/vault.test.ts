import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import {
  generateMnemonic,
  isValidMnemonic,
  parsePrivateKey,
  privateKeyFromMnemonic,
  addressOf,
  InvalidKeyError,
} from "./keys.js";
import {
  openVault,
  sealVault,
  WeakPasswordError,
  WrongPasswordError,
  type VaultBlob,
} from "./vault.js";

const FAST = { N: 2 ** 10, r: 8, p: 1 }; // cheap params for tests only
const PASSWORD = "correct horse battery";

describe("keys", () => {
  it("derives the standard address from a public BIP-39 test vector", async () => {
    // Public fixture: the well-known Hardhat/Anvil test mnemonic. Never holds funds.
    const pk = await privateKeyFromMnemonic(
      "test test test test test test test test test test test junk",
    );
    expect(addressOf(pk)).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });
  it("generates valid 12-word mnemonics", () => {
    const m = generateMnemonic();
    expect(m.split(" ")).toHaveLength(12);
    expect(isValidMnemonic(m)).toBe(true);
    expect(isValidMnemonic(`  ${m.toUpperCase()}  `)).toBe(true);
  });
  it("rejects bad mnemonics and out-of-range private keys", async () => {
    await expect(privateKeyFromMnemonic("test test test")).rejects.toThrow(InvalidKeyError);
    expect(() => parsePrivateKey("0x1234")).toThrow(InvalidKeyError);
    expect(() => parsePrivateKey(`0x${"0".repeat(64)}`)).toThrow(InvalidKeyError);
    expect(() => parsePrivateKey(`0x${"f".repeat(64)}`)).toThrow(InvalidKeyError);
  });
});

describe("vault", () => {
  it("round-trips a private key and a mnemonic", async () => {
    const hex = generatePrivateKey();
    const blob = await sealVault({ kind: "privateKey", value: hex }, PASSWORD, { scrypt: FAST });
    expect(blob.address).toBe(privateKeyToAddress(hex));
    expect(JSON.stringify(blob)).not.toContain(hex.slice(2)); // never stored in the clear
    expect(await openVault(blob, PASSWORD)).toEqual({ kind: "privateKey", value: hex });

    const m = generateMnemonic();
    const mb = await sealVault({ kind: "mnemonic", value: m }, PASSWORD, { scrypt: FAST });
    expect((await openVault(mb, PASSWORD)).value).toBe(m);
  });

  it("uses a fresh salt and IV every time", async () => {
    const hex = generatePrivateKey();
    const a = await sealVault({ kind: "privateKey", value: hex }, PASSWORD, { scrypt: FAST });
    const b = await sealVault({ kind: "privateKey", value: hex }, PASSWORD, { scrypt: FAST });
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects the wrong password", async () => {
    const blob = await sealVault({ kind: "privateKey", value: generatePrivateKey() }, PASSWORD, {
      scrypt: FAST,
    });
    await expect(openVault(blob, "wrong password!")).rejects.toThrow(WrongPasswordError);
  });

  it("detects tampering with any authenticated field", async () => {
    const blob = await sealVault({ kind: "privateKey", value: generatePrivateKey() }, PASSWORD, {
      scrypt: FAST,
    });
    const swapped: VaultBlob = { ...blob, address: privateKeyToAddress(generatePrivateKey()) };
    await expect(openVault(swapped, PASSWORD)).rejects.toThrow(WrongPasswordError);
    const flipped: VaultBlob = {
      ...blob,
      ct: `${blob.ct.slice(0, -2)}${blob.ct.endsWith("00") ? "01" : "00"}` as `0x${string}`,
    };
    await expect(openVault(flipped, PASSWORD)).rejects.toThrow(WrongPasswordError);
    const huge: VaultBlob = { ...blob, kdf: { ...blob.kdf, N: 2 ** 24 } };
    await expect(openVault(huge, PASSWORD)).rejects.toThrow(/out of range/);
  });

  it("refuses short passwords", async () => {
    await expect(
      sealVault({ kind: "privateKey", value: generatePrivateKey() }, "short", { scrypt: FAST }),
    ).rejects.toThrow(WeakPasswordError);
  });
});
