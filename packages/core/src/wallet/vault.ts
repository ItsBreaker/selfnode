/**
 * Encryption at rest. scrypt (from @noble/hashes) stretches the password into
 * a 256-bit key; AES-GCM (WebCrypto) encrypts the secret with a random IV.
 * The version, kind, address and KDF parameters are bound as additional
 * authenticated data, so no field of a stored vault can be swapped or edited
 * without decryption failing.
 */
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes, getAddress, type Address, type Hex } from "viem";
import { addressOf, parsePrivateKey, privateKeyFromMnemonic } from "./keys.js";

export type SecretKind = "mnemonic" | "privateKey";
export interface Secret {
  kind: SecretKind;
  /** The mnemonic phrase, or the private key as 0x-hex. */
  value: string;
}

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}
/** ~128 MiB of memory per guess. Tests pass cheaper params explicitly. */
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
export const MIN_PASSWORD_LENGTH = 10;

export interface VaultBlob {
  v: 1;
  kind: SecretKind;
  address: Address;
  kdf: { name: "scrypt"; salt: Hex } & ScryptParams;
  cipher: { name: "AES-GCM"; iv: Hex };
  ct: Hex;
  createdAt: number;
}

export class WrongPasswordError extends Error {
  override readonly name = "WrongPasswordError";
  constructor() {
    super("That password doesn't unlock this wallet");
  }
}
export class WeakPasswordError extends Error {
  override readonly name = "WeakPasswordError";
}

export function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

const enc = new TextEncoder();
/** Copy into a fresh ArrayBuffer-backed view (WebCrypto's BufferSource). Public data only. */
const buf = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u);
const dec = new TextDecoder();

function aad(b: Pick<VaultBlob, "v" | "kind" | "address" | "kdf" | "cipher">): Uint8Array {
  return enc.encode(
    [
      "selfnode-vault",
      b.v,
      b.kind,
      b.address.toLowerCase(),
      b.kdf.N,
      b.kdf.r,
      b.kdf.p,
      b.kdf.salt,
      b.cipher.iv,
    ].join(":"),
  );
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  p: ScryptParams,
  onProgress?: (f: number) => void,
) {
  const dk = await scryptAsync(password.normalize("NFKC"), salt, {
    ...p,
    dkLen: 32,
    maxmem: 128 * p.N * p.r * 2,
    ...(onProgress ? { onProgress } : {}),
  });
  try {
    return await crypto.subtle.importKey("raw", dk, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    dk.fill(0);
  }
}

/** The address a secret controls (validates the secret on the way). */
export async function addressOfSecret(secret: Secret): Promise<Address> {
  const pk =
    secret.kind === "mnemonic"
      ? await privateKeyFromMnemonic(secret.value)
      : parsePrivateKey(secret.value);
  try {
    return addressOf(pk);
  } finally {
    pk.fill(0);
  }
}

export async function sealVault(
  secret: Secret,
  password: string,
  opts: { scrypt?: ScryptParams; onProgress?: (f: number) => void } = {},
): Promise<VaultBlob> {
  assertPassword(password);
  const params = opts.scrypt ?? DEFAULT_SCRYPT;
  const address = getAddress(await addressOfSecret(secret));
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = {
    v: 1 as const,
    kind: secret.kind,
    address,
    kdf: { name: "scrypt" as const, salt: bytesToHex(salt), ...params },
    cipher: { name: "AES-GCM" as const, iv: bytesToHex(iv) },
  };
  const key = await deriveKey(password, salt, params, opts.onProgress);
  const plain = enc.encode(secret.value);
  try {
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: buf(aad(header)) },
        key,
        plain,
      ),
    );
    return { ...header, ct: bytesToHex(ct), createdAt: Date.now() };
  } finally {
    plain.fill(0);
  }
}

export async function openVault(
  blob: VaultBlob,
  password: string,
  onProgress?: (f: number) => void,
): Promise<Secret> {
  if (blob.v !== 1 || blob.kdf.name !== "scrypt" || blob.cipher.name !== "AES-GCM")
    throw new Error("Unsupported vault format");
  // Refuse absurd parameters from a tampered blob before spending memory on them.
  if (blob.kdf.N > 2 ** 20 || blob.kdf.r > 16 || blob.kdf.p > 4)
    throw new Error("Vault parameters out of range");
  const key = await deriveKey(password, hexToBytes(blob.kdf.salt), blob.kdf, onProgress);
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf(hexToBytes(blob.cipher.iv)), additionalData: buf(aad(blob)) },
        key,
        buf(hexToBytes(blob.ct)),
      ),
    );
  } catch {
    throw new WrongPasswordError();
  }
  try {
    const secret: Secret = { kind: blob.kind, value: dec.decode(plain) };
    if ((await addressOfSecret(secret)).toLowerCase() !== blob.address.toLowerCase()) {
      throw new Error("Vault contents don't match its address");
    }
    return secret;
  } finally {
    plain.fill(0);
  }
}
