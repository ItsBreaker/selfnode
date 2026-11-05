/**
 * THE signing module. Everything that signs goes through here, and nothing
 * else touches private keys for signing. Keep it small and easy to audit.
 *
 * Rules enforced here:
 * 1. Testnet only. A transaction or typed-data signature must name a chain
 *    ID that config marks as a testnet (Sepolia). Mainnet, unknown chains and
 *    a missing chain ID are refused. EIP-155 then binds the signature to that
 *    chain, so it can't be replayed on mainnet.
 * 2. No personal_sign / eth_sign. Those signatures aren't bound to a chain.
 * 3. The key is used only for the duration of one signature.
 */
import { bytesToHex, type Hex, type TransactionSerializable, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chains } from "../config/chains.js";
import type { WalletSession } from "./session.js";

export class SigningGuardError extends Error {
  override readonly name = "SigningGuardError";
}

const SIGNING_CHAIN_IDS: ReadonlySet<number> = new Set(
  Object.values(chains)
    .filter((c) => c.testnet)
    .map((c) => c.id),
);

/** Throws unless `chainId` is an allowed testnet. */
export function assertSigningChain(chainId: number | bigint | undefined | null): void {
  if (chainId === undefined || chainId === null) {
    throw new SigningGuardError(
      "Refusing to sign without a chain ID (it could be replayed on any chain)",
    );
  }
  const id = Number(chainId);
  if (!SIGNING_CHAIN_IDS.has(id)) {
    const known = Object.values(chains).find((c) => c.id === id);
    throw new SigningGuardError(
      known
        ? `Signing on ${known.name} is disabled. This build signs on testnets (Sepolia) only.`
        : `Refusing to sign for unknown chain ${id}`,
    );
  }
}

function accountFor(session: WalletSession) {
  return session.withKey((key) => {
    const account = privateKeyToAccount(bytesToHex(key));
    if (account.address !== session.address)
      throw new SigningGuardError("Key doesn't match the wallet address");
    return account;
  });
}

export async function signTransaction(
  session: WalletSession,
  tx: TransactionSerializable,
): Promise<Hex> {
  assertSigningChain(tx.chainId);
  if (tx.type !== "eip1559") throw new SigningGuardError("Only EIP-1559 transactions are signed");
  return accountFor(session).signTransaction(tx);
}

export async function signTypedData(
  session: WalletSession,
  typedData: TypedDataDefinition,
): Promise<Hex> {
  const domain = typedData.domain as { chainId?: number | bigint } | undefined;
  assertSigningChain(domain?.chainId);
  return accountFor(session).signTypedData(typedData);
}
