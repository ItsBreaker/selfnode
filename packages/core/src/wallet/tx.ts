/**
 * Turn a contract call into a signable EIP-1559 transaction through the
 * active-route client: nonce, fees and a gas estimate with a 20% buffer.
 */
import type { Address, Hex, PublicClient, TransactionSerializableEIP1559 } from "viem";
import { chains, type ChainKey } from "../config/chains.js";
import { assertSigningChain } from "./signer.js";

export async function prepareCall(
  client: PublicClient,
  req: { chain: ChainKey; from: Address; to: Address; data?: Hex; value?: bigint },
): Promise<{ tx: TransactionSerializableEIP1559; maxCost: bigint }> {
  const chainId = chains[req.chain].id;
  assertSigningChain(chainId);
  const call = {
    account: req.from,
    to: req.to,
    ...(req.data ? { data: req.data } : {}),
    value: req.value ?? 0n,
  };
  const [nonce, fees, gas] = await Promise.all([
    client.getTransactionCount({ address: req.from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.estimateGas(call),
  ]);
  const tip = fees.maxPriorityFeePerGas;
  const maxFeePerGas = fees.maxFeePerGas > tip ? fees.maxFeePerGas : tip * 2n; // keep tip ≤ cap on near-zero base fees
  const limit = (gas * 120n) / 100n;
  return {
    tx: {
      type: "eip1559",
      chainId,
      nonce,
      gas: limit,
      maxFeePerGas,
      maxPriorityFeePerGas: tip,
      to: req.to,
      value: req.value ?? 0n,
      ...(req.data ? { data: req.data } : {}),
    },
    maxCost: limit * maxFeePerGas,
  };
}
