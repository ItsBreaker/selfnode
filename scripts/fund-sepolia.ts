/**
 * Dev/demo helper: send a little Sepolia ETH from the local test wallet
 * (SEPOLIA_TEST_PRIVATE_KEY in .env) to an address. Sepolia only; the key is
 * never printed.
 * usage: pnpm --filter @selfnode/scripts fund <address> [ether=0.002]
 */
import { createWalletClient, http, isAddress, parseEther, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const pk = process.env.SEPOLIA_TEST_PRIVATE_KEY as `0x${string}` | undefined;
const [to, eth = "0.002"] = process.argv.slice(2);
if (!pk) throw new Error("SEPOLIA_TEST_PRIVATE_KEY must be set in .env");
if (!to || !isAddress(to)) throw new Error("usage: fund <address> [ether]");
if (Number(eth) > 0.01) throw new Error("Refusing to send more than 0.01 ETH from the test wallet");

const client = createWalletClient({
  chain: sepolia, // hard-coded: this helper can only ever touch Sepolia
  account: privateKeyToAccount(pk),
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
}).extend(publicActions);
const hash = await client.sendTransaction({ to, value: parseEther(eth) });
console.log("funding tx", hash);
const r = await client.waitForTransactionReceipt({ hash });
console.log("status", r.status, "block", r.blockNumber);
