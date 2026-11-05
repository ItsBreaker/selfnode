/**
 * Preparing a send, and the plain-English pre-sign preview.
 * `gatherSendFacts` does the I/O (through the active transport). `assessSend`
 * is pure, so every warning rule is unit-tested.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionSerializableEIP1559,
} from "viem";
import { chains, type ChainKey } from "../config/chains.js";
import { formatAmount } from "../format.js";
import { assertSigningChain } from "./signer.js";

export type Asset =
  | { kind: "native"; symbol: string; decimals: 18 }
  | { kind: "erc20"; address: Address; symbol: string; decimals: number };

export interface SendRequest {
  chain: ChainKey;
  from: Address;
  to: Address;
  asset: Asset;
  amount: bigint;
}

/** Optional label lookup (wired to Arkiv in Phase 3). */
export interface RecipientLabel {
  name: string;
  category?: string;
  source: string;
}

export interface SendFacts {
  nonce: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasEstimate: bigint | null;
  simulation: { ok: true } | { ok: false; reason: string };
  nativeBalance: bigint;
  tokenBalance: bigint | null;
  recipientIsContract: boolean;
  recipientTxCount: number;
  recipientLabel: RecipientLabel | null;
}

export type WarningLevel = "danger" | "warning" | "info";
export interface SendWarning {
  level: WarningLevel;
  message: string;
  /** Blocking: the send can't proceed. Otherwise "danger" needs explicit acknowledgement. */
  blocking: boolean;
}

export interface SendPreview {
  summary: string;
  call: {
    contract: Address;
    functionName: "transfer";
    args: { to: Address; amount: string };
  } | null;
  recipient: {
    address: Address;
    label: RecipientLabel | null;
    isContract: boolean;
    isNew: boolean;
  };
  fee: { gasLimit: bigint; maxFeePerGas: bigint; maxCost: bigint };
  simulation: SendFacts["simulation"];
  warnings: SendWarning[];
  /** True if any warning is "danger" but not blocking: the user must tick to proceed. */
  needsAcknowledgement: boolean;
  canSend: boolean;
}

/** Categories from label sources that mean "don't send here". */
export const FLAGGED_CATEGORIES = new Set([
  "phish-hack",
  "phishing",
  "scam",
  "exploit",
  "hack",
  "sanctioned",
  "flagged",
]);

const fmt = (v: bigint, d: number) => {
  const f = formatAmount(v, d, 6);
  if (f.whole === "0" && !f.fraction && f.truncated) return "< 0.000001";
  return `${f.whole}${f.fraction ? `.${f.fraction}` : ""}`;
};

export function txFields(req: SendRequest): { to: Address; value: bigint; data?: Hex } {
  if (req.asset.kind === "native") return { to: req.to, value: req.amount };
  return {
    to: req.asset.address,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [req.to, req.amount],
    }),
  };
}

export function assessSend(
  req: SendRequest,
  facts: SendFacts,
): { preview: SendPreview; tx: TransactionSerializableEIP1559 | null } {
  const chain = chains[req.chain];
  const warnings: SendWarning[] = [];
  const w = (level: WarningLevel, message: string, blocking = false) =>
    warnings.push({ level, message, blocking });
  const { symbol, decimals } = req.asset;
  const gasLimit = facts.gasEstimate !== null ? (facts.gasEstimate * 120n) / 100n : 0n;
  const maxCost = gasLimit * facts.maxFeePerGas;
  const nativeNeeded = maxCost + (req.asset.kind === "native" ? req.amount : 0n);

  if (req.amount <= 0n) w("danger", "Enter an amount greater than zero.", true);
  if (isAddressEqual(req.to, zeroAddress))
    w("danger", "This is the zero address. Anything sent here is lost forever.");
  if (req.asset.kind === "erc20" && isAddressEqual(req.to, req.asset.address)) {
    w(
      "danger",
      `This is the ${symbol} token contract itself. Tokens sent to it are almost always lost.`,
    );
  }
  if (
    facts.recipientLabel?.category &&
    FLAGGED_CATEGORIES.has(facts.recipientLabel.category.toLowerCase())
  ) {
    w(
      "danger",
      `This address is labelled "${facts.recipientLabel.name}" (${facts.recipientLabel.category}) by ${facts.recipientLabel.source}.`,
    );
  }
  if (!facts.simulation.ok) w("danger", `Simulation failed: ${facts.simulation.reason}`, true);
  if (
    req.asset.kind === "erc20" &&
    facts.tokenBalance !== null &&
    facts.tokenBalance < req.amount
  ) {
    w("danger", `Not enough ${symbol}: you have ${fmt(facts.tokenBalance, decimals)}.`, true);
  }
  if (facts.nativeBalance < nativeNeeded) {
    w(
      "danger",
      `Not enough ETH for this send and its network fee (up to ${fmt(nativeNeeded, 18)} ETH needed).`,
      true,
    );
  }
  if (isAddressEqual(req.to, req.from)) w("info", "You're sending to your own address.");
  if (facts.recipientIsContract && req.asset.kind === "native") {
    w("warning", "The recipient is a contract. Make sure it's meant to receive ETH.");
  }
  const isNew = !facts.recipientIsContract && facts.recipientTxCount === 0;
  if (isNew && !isAddressEqual(req.to, zeroAddress)) {
    w("info", "This address has never sent a transaction. Double-check you copied it correctly.");
  }

  const blocked = warnings.some((x) => x.blocking);
  const preview: SendPreview = {
    summary: `Send ${fmt(req.amount, decimals)} ${symbol} to ${facts.recipientLabel?.name ?? getAddress(req.to)} on ${chain.name}`,
    call:
      req.asset.kind === "erc20"
        ? {
            contract: req.asset.address,
            functionName: "transfer",
            args: { to: req.to, amount: `${fmt(req.amount, decimals)} ${symbol}` },
          }
        : null,
    recipient: {
      address: getAddress(req.to),
      label: facts.recipientLabel,
      isContract: facts.recipientIsContract,
      isNew,
    },
    fee: { gasLimit, maxFeePerGas: facts.maxFeePerGas, maxCost },
    simulation: facts.simulation,
    warnings,
    needsAcknowledgement: warnings.some((x) => x.level === "danger" && !x.blocking),
    canSend: !blocked && facts.gasEstimate !== null,
  };
  const tx: TransactionSerializableEIP1559 | null = preview.canSend
    ? {
        type: "eip1559",
        chainId: chain.id,
        nonce: facts.nonce,
        gas: gasLimit,
        maxFeePerGas: facts.maxFeePerGas,
        maxPriorityFeePerGas: facts.maxPriorityFeePerGas,
        ...txFields(req),
      }
    : null;
  return { preview, tx };
}

function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError)
      return revert.reason ?? revert.shortMessage;
    return e.shortMessage;
  }
  return e instanceof Error ? (e.message.split("\n")[0] ?? "unknown error") : String(e);
}

/** Gather everything the preview needs, through the given (active-route) client. */
export async function gatherSendFacts(
  client: PublicClient,
  req: SendRequest,
  labelOf?: (a: Address) => Promise<RecipientLabel | null>,
): Promise<SendFacts> {
  assertSigningChain(chains[req.chain].id); // don't even prepare a mainnet send
  const fields = txFields(req);
  const [nonce, fees, nativeBalance, tokenBalance, code, recipientTxCount, label] =
    await Promise.all([
      client.getTransactionCount({ address: req.from, blockTag: "pending" }),
      client.estimateFeesPerGas(),
      client.getBalance({ address: req.from }),
      req.asset.kind === "erc20"
        ? client.readContract({
            address: req.asset.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [req.from],
          })
        : Promise.resolve(null),
      client.getCode({ address: req.to }),
      client.getTransactionCount({ address: req.to }),
      labelOf ? labelOf(req.to).catch(() => null) : Promise.resolve(null),
    ]);
  let gasEstimate: bigint | null = null;
  let simulation: SendFacts["simulation"] = { ok: true };
  try {
    await client.call({ account: req.from, ...fields });
    gasEstimate = await client.estimateGas({ account: req.from, ...fields });
  } catch (e) {
    simulation = { ok: false, reason: revertReason(e) };
  }
  // Tiny Sepolia base fees can make the suggested tip exceed the cap; keep tip ≤ cap.
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
  const maxFeePerGas =
    fees.maxFeePerGas > maxPriorityFeePerGas ? fees.maxFeePerGas : maxPriorityFeePerGas * 2n;
  return {
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasEstimate,
    simulation,
    nativeBalance,
    tokenBalance,
    recipientIsContract: !!code && code !== "0x",
    recipientTxCount,
    recipientLabel: label,
  };
}
