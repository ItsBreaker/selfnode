/**
 * Key generation and import. BIP-39 mnemonics (English, 12 words) derived at
 * the standard Ethereum path, or a raw secp256k1 private key.
 */
import { HDKey } from "@scure/bip32";
import { generateMnemonic as bip39Generate, mnemonicToSeed, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bytesToHex, hexToBytes, type Address } from "viem";
import { privateKeyToAddress } from "viem/accounts";

export const DERIVATION_PATH = "m/44'/60'/0'/0/0";
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export class InvalidKeyError extends Error {
  override readonly name = "InvalidKeyError";
}

/** The standard path for account `index` (0 = the first account). */
export const derivationPath = (index: number) => {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31)
    throw new InvalidKeyError(`Invalid account index ${index}`);
  return `m/44'/60'/0'/0/${index}`;
};

/** A new 12-word (128-bit) mnemonic from the platform CSPRNG. */
export function generateMnemonic(): string {
  return bip39Generate(wordlist, 128);
}

export function normalizeMnemonic(input: string): string {
  return input.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidMnemonic(input: string): boolean {
  return validateMnemonic(normalizeMnemonic(input), wordlist);
}

/** Derive account `index`'s private key (default 0). The caller owns (and should wipe) the bytes. */
export async function privateKeyFromMnemonic(mnemonic: string, index = 0): Promise<Uint8Array> {
  const m = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(m, wordlist)) throw new InvalidKeyError("That recovery phrase isn't valid");
  const seed = await mnemonicToSeed(m);
  try {
    const key = HDKey.fromMasterSeed(seed).derive(derivationPath(index));
    if (!key.privateKey) throw new InvalidKeyError("Derivation produced no private key");
    const out = Uint8Array.from(key.privateKey);
    key.wipePrivateData();
    return out;
  } finally {
    seed.fill(0);
  }
}

/** Parse a hex private key (with or without 0x) and check it's in range. */
export function parsePrivateKey(input: string): Uint8Array {
  const hex = input.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new InvalidKeyError("A private key is 64 hexadecimal characters");
  const n = BigInt(`0x${hex}`);
  if (n === 0n || n >= SECP256K1_N)
    throw new InvalidKeyError("That isn't a valid secp256k1 private key");
  return hexToBytes(`0x${hex}`);
}

export function addressOf(privateKey: Uint8Array): Address {
  return privateKeyToAddress(bytesToHex(privateKey));
}
