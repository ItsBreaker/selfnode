/**
 * Phase 4 spike: real Sepolia round trip with tiny amounts, signed by core's
 * testnet-only signer. ETH→USDC, then USDC→ETH via Permit2 (ERC-20 approve to
 * Permit2 if needed, then a PermitSingle signature inside the router call).
 */
import {
  approvalState,
  buildSwapCall,
  NATIVE,
  permit2TypedData,
  permitFor,
  quoteExactIn,
  signTransaction,
  signTypedData,
  uniswapSepolia,
  WalletSession,
} from "@selfnode/core";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  hexToBytes,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { sepolia } from "viem/chains";

const must = <T>(v: T | undefined | null, what = "value"): T => {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
};

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const pk = process.env.SEPOLIA_TEST_PRIVATE_KEY as Hex;
const session = new WalletSession(hexToBytes(pk), privateKeyToAddress(pk));
const me = session.address;
const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});
const USDC = uniswapSepolia.tokens.usdc as Address;

async function send(to: Address, data: Hex, value: bigint, label: string) {
  const [nonce, fees, gas] = await Promise.all([
    client.getTransactionCount({ address: me, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.estimateGas({ account: me, to, data, value }),
  ]);
  const tip = fees.maxPriorityFeePerGas;
  const raw = await signTransaction(session, {
    type: "eip1559",
    chainId: sepolia.id,
    to,
    data,
    value,
    nonce,
    gas: (gas * 12n) / 10n,
    maxPriorityFeePerGas: tip,
    maxFeePerGas: fees.maxFeePerGas > tip ? fees.maxFeePerGas * 2n : tip * 2n,
  });
  const hash = await client.sendRawTransaction({ serializedTransaction: raw });
  const r = await client.waitForTransactionReceipt({ hash });
  console.log(`${label}: ${r.status} ${hash} gas ${r.gasUsed}`);
  if (r.status !== "success") throw new Error(`${label} failed`);
}
const usdcBal = () =>
  client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [me] });
const deadline = () => Math.floor(Date.now() / 1000) + 20 * 60;

console.log(
  "ETH",
  formatEther(await client.getBalance({ address: me })),
  "USDC",
  formatUnits(await usdcBal(), 6),
);
// 1) ETH → USDC
const q1 = must(
  (
    await quoteExactIn(client as never, {
      tokenIn: NATIVE,
      tokenOut: USDC,
      amountIn: parseEther("0.0002"),
    })
  )[0],
  "quote",
);
console.log(
  `quote: 0.0002 ETH → ${formatUnits(q1.amountOut, 6)} USDC via fee ${q1.key.fee}, impact ${q1.priceImpactBps / 100}%`,
);
const c1 = buildSwapCall(q1, { slippageBps: 50, deadline: deadline() });
await send(c1.to, c1.data, c1.value, "swap ETH→USDC");
const got = await usdcBal();
console.log("USDC now", formatUnits(got, 6));

// 2) USDC → ETH with Permit2
const amountIn = got / 2n;
const q2 = must(
  (await quoteExactIn(client as never, { tokenIn: USDC, tokenOut: NATIVE, amountIn }))[0],
  "quote",
);
console.log(
  `quote: ${formatUnits(amountIn, 6)} USDC → ${formatEther(q2.amountOut)} ETH via fee ${q2.key.fee}`,
);
const st = await approvalState(client as never, me, USDC, amountIn, Math.floor(Date.now() / 1000));
console.log("approval state", st);
if (st.needsErc20Approval) {
  await send(
    USDC,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [uniswapSepolia.permit2, amountIn],
    }),
    0n,
    "approve USDC→Permit2 (exact amount)",
  );
}
const dl = deadline();
let permit;
if (st.needsPermitSignature) {
  const p = permitFor(USDC, amountIn, st.permit2Nonce, dl);
  const signature = await signTypedData(
    session,
    permit2TypedData(uniswapSepolia.permit2, sepolia.id, p) as never,
  );
  permit = { permit: p, signature };
}
const c2 = buildSwapCall(q2, { slippageBps: 100, deadline: dl, ...(permit ? { permit } : {}) });
await send(c2.to, c2.data, c2.value, "swap USDC→ETH (Permit2)");
console.log(
  "ETH",
  formatEther(await client.getBalance({ address: me })),
  "USDC",
  formatUnits(await usdcBal(), 6),
);
session.lock();
