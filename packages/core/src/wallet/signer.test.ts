import { describe, expect, it } from "vitest";
import {
  hexToBytes,
  parseEther,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  type TransactionSerializable,
} from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { LockedError, WalletSession } from "./session.js";
import { assertSigningChain, signTransaction, signTypedData, SigningGuardError } from "./signer.js";

// Test keys are generated at runtime; nothing here is a real key.
function freshSession() {
  const hex = generatePrivateKey();
  return new WalletSession(hexToBytes(hex), privateKeyToAddress(hex));
}

const tx = (chainId: number | undefined): TransactionSerializable =>
  ({
    type: "eip1559",
    chainId,
    to: "0x000000000000000000000000000000000000dEaD",
    value: parseEther("0.001"),
    nonce: 0,
    gas: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  }) as TransactionSerializable;

const typed = (chainId: number) => ({
  domain: { name: "Test", version: "1", chainId },
  types: { Msg: [{ name: "x", type: "uint256" }] },
  primaryType: "Msg" as const,
  message: { x: 1n },
});

describe("testnet guard", () => {
  it("signs on Sepolia, and the signature recovers to the wallet address", async () => {
    const s = freshSession();
    const raw = await signTransaction(s, tx(11155111));
    expect(await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toBe(
      s.address,
    );
  });

  it("refuses mainnet transactions", async () => {
    await expect(signTransaction(freshSession(), tx(1))).rejects.toThrow(SigningGuardError);
    await expect(signTransaction(freshSession(), tx(1))).rejects.toThrow(/Ethereum is disabled/);
  });

  it("refuses a missing chain ID and unknown chains", async () => {
    await expect(signTransaction(freshSession(), tx(undefined))).rejects.toThrow(
      /without a chain ID/,
    );
    await expect(signTransaction(freshSession(), tx(5))).rejects.toThrow(/unknown chain 5/);
  });

  it("refuses non-EIP-1559 transactions", async () => {
    const legacy = {
      ...tx(11155111),
      type: "legacy",
      gasPrice: 1n,
    } as unknown as TransactionSerializable;
    await expect(signTransaction(freshSession(), legacy)).rejects.toThrow(/Only EIP-1559/);
  });

  it("applies the same guard to typed data (Permit2 signatures)", async () => {
    const s = freshSession();
    await expect(signTypedData(s, typed(1))).rejects.toThrow(SigningGuardError);
    const sig = await signTypedData(s, typed(11155111));
    expect(await recoverTypedDataAddress({ ...typed(11155111), signature: sig })).toBe(s.address);
  });

  it("refuses to sign once locked, and zeroes the key", async () => {
    const hex = generatePrivateKey();
    const key = hexToBytes(hex);
    const s = new WalletSession(key, privateKeyToAddress(hex));
    s.lock();
    expect(key.every((b) => b === 0)).toBe(true);
    await expect(signTransaction(s, tx(11155111))).rejects.toThrow(LockedError);
  });

  it("assertSigningChain accepts bigint chain IDs", () => {
    expect(() => assertSigningChain(11155111n)).not.toThrow();
    expect(() => assertSigningChain(1n)).toThrow(SigningGuardError);
  });
});
