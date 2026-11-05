/**
 * Phase 0 spike helper: sign tiny Sepolia self-transfers OFFLINE-style in Node
 * and print only the signed raw transactions (public once broadcast anyway).
 * The private key never leaves this process and is never printed.
 * usage: tsx spikes/sign-sepolia-tx.ts [count]
 *
 * Note: nonce and fee data are read directly from a public RPC here, which
 * links this test address to the dev machine's IP. Acceptable for a throwaway
 * test key; the app itself reads these through Anon-RPC.
 */
import { createPublicClient, http, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const pk = process.env.SEPOLIA_TEST_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("SEPOLIA_TEST_PRIVATE_KEY must be set in .env");
const account = privateKeyToAccount(pk);
const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

const count = Number(process.argv[2] ?? 1);
const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
const fees = await client.estimateFeesPerGas();
const tip =
  fees.maxPriorityFeePerGas > parseGwei("0.01") ? fees.maxPriorityFeePerGas : parseGwei("0.01");
for (let i = 0; i < count; i++) {
  const raw = await account.signTransaction({
    chainId: sepolia.id,
    type: "eip1559",
    to: account.address,
    value: 1n, // 1 wei to self
    nonce: nonce + i,
    gas: 21_000n,
    maxFeePerGas: fees.maxFeePerGas * 2n + tip,
    maxPriorityFeePerGas: tip,
  });
  console.log(raw);
}
