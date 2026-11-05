/**
 * Uniswap v4 swap on Sepolia: ETH ⇄ USDC on the existing pools.
 * Quotes are eth_calls to the v4 Quoter through the active route (no Uniswap
 * API). Execution goes through the Universal Router; selling USDC uses an
 * exact-amount ERC-20 approval to Permit2 plus a Permit2 signature.
 */
import {
  approvalState,
  assessSwap,
  buildSwapCall,
  chains,
  formatAmount,
  NATIVE,
  permit2TypedData,
  permitFor,
  prepareCall,
  quoteExactIn,
  signTransaction,
  signTypedData,
  uniswapSepolia,
  type PermitSingle,
  type Quote,
  type SwapWarning,
} from "@selfnode/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type Address,
  type Hex,
  type TransactionSerializableEIP1559,
  type TypedDataDefinition,
} from "viem";
import { Page } from "../app/AppShell";
import { usePublicClient, useRouteKey, useSelfnode } from "../state/selfnode";
import { useWallet } from "../state/wallet";
import { activityStore } from "../storage/db";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Callout, EmptyState } from "../ui/Callout";
import { Field } from "../ui/Field";
import { Panel } from "../ui/Panel";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { TextLink } from "../ui/TextLink";

const TOKENS = {
  ETH: { address: NATIVE as Address, symbol: "ETH", decimals: 18 },
  USDC: { address: uniswapSepolia.tokens.usdc as Address, symbol: "USDC", decimals: 6 },
} as const;
type Sym = keyof typeof TOKENS;

const fmt = (v: bigint, d: number, max = 6) => {
  const f = formatAmount(v, d, max);
  return f.whole === "0" && !f.fraction && f.truncated
    ? `< 0.${"0".repeat(max - 1)}1`
    : `${f.whole}${f.fraction ? `.${f.fraction}` : ""}`;
};
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const feePct = (fee: number) => `${fee / 10_000}%`;

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

type Phase =
  | { k: "edit" }
  | { k: "working"; step: string }
  | {
      k: "review";
      quote: Quote;
      tx: TransactionSerializableEIP1559;
      warnings: SwapWarning[];
      canSwap: boolean;
      needsAck: boolean;
      minOut: bigint;
      maxCost: bigint;
    }
  | { k: "done"; hash: Hex; status: "pending" | "confirmed" | "failed" }
  | { k: "error"; message: string };

export function Swap() {
  const { settings } = useSelfnode();
  const chain = chains[settings.chain];
  if (!chain.testnet) {
    return (
      <Page title="Swap">
        <Callout title={`Swaps are disabled on ${chain.name}`}>
          This build only signs on Sepolia. Switch the network in{" "}
          <TextLink to="/settings">Settings</TextLink> to swap.
        </Callout>
      </Page>
    );
  }
  return <SwapSepolia />;
}

function SwapSepolia() {
  const client = usePublicClient();
  const routeKey = useRouteKey();
  const qc = useQueryClient();
  const { status, session, address } = useWallet();
  const [sell, setSell] = useState<Sym>("ETH");
  const buy: Sym = sell === "ETH" ? "USDC" : "ETH";
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [deadlineMin, setDeadlineMin] = useState(20);
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "edit" });
  const tIn = TOKENS[sell];
  const tOut = TOKENS[buy];

  let amountIn: bigint | null = null;
  let amountError: string | undefined;
  if (amount.trim()) {
    try {
      if (!/^\d*\.?\d*$/.test(amount.trim())) throw new Error();
      amountIn = parseUnits(amount.trim(), tIn.decimals);
    } catch {
      amountError = `Enter a number with at most ${tIn.decimals} decimals`;
    }
  }
  const debounced = useDebounced(amountIn, 400);

  const quotes = useQuery({
    enabled: !!debounced && debounced > 0n,
    queryKey: ["quote", routeKey, sell, debounced?.toString()],
    queryFn: () =>
      quoteExactIn(client, {
        tokenIn: tIn.address,
        tokenOut: tOut.address,
        amountIn: debounced as bigint,
      }),
    refetchInterval: 20_000,
    retry: false,
  });
  const best = quotes.data?.[0];

  const balances = useQuery({
    enabled: !!address,
    queryKey: ["swap-balances", routeKey, address],
    queryFn: async () => {
      const [eth, usdc] = await Promise.all([
        client.getBalance({ address: address as Address }),
        client.readContract({
          address: TOKENS.USDC.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as Address],
        }),
      ]);
      return { ETH: eth, USDC: usdc } as Record<Sym, bigint>;
    },
    refetchInterval: 30_000,
  });

  const signAndSend = async (tx: TransactionSerializableEIP1559, step: string): Promise<Hex> => {
    if (!session) throw new Error("The wallet locked. Unlock it and try again.");
    setPhase({ k: "working", step: `${step}: signing on this device…` });
    const raw = await signTransaction(session, tx);
    setPhase({ k: "working", step: `${step}: broadcasting through the anonymity network…` });
    const hash = await client.sendRawTransaction({ serializedTransaction: raw });
    setPhase({ k: "working", step: `${step}: waiting for confirmation…` });
    const r = await client.waitForTransactionReceipt({
      hash,
      timeout: 300_000,
      pollingInterval: 4_000,
    });
    if (r.status !== "success") throw new Error(`${step} failed on-chain (${hash})`);
    return hash;
  };

  /** Approve (if needed), sign the Permit2 permit (if needed), simulate, and show the preview. */
  const review = async () => {
    if (!best || !address || !session) return;
    setAck(false);
    try {
      const now = Math.floor(Date.now() / 1000);
      const deadline = now + deadlineMin * 60;
      let permit: { permit: PermitSingle; signature: Hex } | undefined;
      if (best.tokenIn !== NATIVE) {
        setPhase({ k: "working", step: "Checking Permit2 approval…" });
        const st = await approvalState(client, address, best.tokenIn, best.amountIn, now);
        if (st.needsErc20Approval) {
          // Exact amount, not unlimited: a compromised spender can't drain more than this swap.
          const { tx } = await prepareCall(client, {
            chain: "sepolia",
            from: address,
            to: best.tokenIn,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [uniswapSepolia.permit2, best.amountIn],
            }),
          });
          await signAndSend(
            tx,
            `Approve ${tIn.symbol} for Permit2 (exactly ${fmt(best.amountIn, tIn.decimals)})`,
          );
        }
        if (st.needsPermitSignature) {
          setPhase({
            k: "working",
            step: "Signing a Permit2 permit for the Universal Router (no transaction)…",
          });
          const p = permitFor(best.tokenIn, best.amountIn, st.permit2Nonce, deadline);
          const signature = await signTypedData(
            session,
            permit2TypedData(
              uniswapSepolia.permit2,
              chains.sepolia.id,
              p,
            ) as unknown as TypedDataDefinition,
          );
          permit = { permit: p, signature };
        }
      }
      setPhase({ k: "working", step: "Simulating the swap through your active route…" });
      const call = buildSwapCall(best, { slippageBps, deadline, ...(permit ? { permit } : {}) });
      let prepared: Awaited<ReturnType<typeof prepareCall>> | null = null;
      let simulation: { ok: true } | { ok: false; reason: string } = { ok: true };
      try {
        prepared = await prepareCall(client, {
          chain: "sepolia",
          from: address,
          to: call.to,
          data: call.data,
          value: call.value,
        });
      } catch (e) {
        simulation = { ok: false, reason: (e as Error).message.split("\n")[0] ?? "reverted" };
      }
      const bal =
        balances.data ??
        ((await qc.fetchQuery({ queryKey: ["swap-balances", routeKey, address] })) as Record<
          Sym,
          bigint
        >);
      const a = assessSwap({
        quote: best,
        slippageBps,
        deadlineMinutes: deadlineMin,
        balanceIn: bal[sell],
        nativeBalance: bal.ETH,
        maxGasCost: prepared?.maxCost ?? 0n,
        simulation,
      });
      if (!prepared) {
        setPhase({
          k: "error",
          message: `Simulation failed: ${simulation.ok ? "" : simulation.reason}`,
        });
        return;
      }
      setPhase({
        k: "review",
        quote: best,
        tx: prepared.tx,
        warnings: a.warnings,
        canSwap: a.canSwap,
        needsAck: a.needsAcknowledgement,
        minOut: call.minOut,
        maxCost: prepared.maxCost,
      });
    } catch (e) {
      setPhase({
        k: "error",
        message: `${(e as Error).message.split("\n")[0]}. Nothing was sent directly; Selfnode never falls back.`,
      });
    }
  };

  const swap = async (p: Extract<Phase, { k: "review" }>) => {
    try {
      const hash = await signAndSend(p.tx, "Swap");
      await activityStore.put({
        hash,
        chain: "sepolia",
        from: address as Address,
        to: uniswapSepolia.universalRouter,
        amount: `Swap ${fmt(p.quote.amountIn, tIn.decimals)} ${tIn.symbol} → ${tOut.symbol}`,
        status: "confirmed",
        createdAt: Date.now(),
      });
      void qc.invalidateQueries({ queryKey: ["swap-balances"] });
      void qc.invalidateQueries({ queryKey: ["balances"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      setPhase({ k: "done", hash, status: "confirmed" });
    } catch (e) {
      setPhase({
        k: "error",
        message: `${(e as Error).message.split("\n")[0]}. Nothing was sent directly; Selfnode never falls back.`,
      });
    }
  };

  return (
    <Page
      title="Swap"
      intro="Uniswap v4 on Sepolia, quoted on-chain through your active connection. No Uniswap API, no API key."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Trade">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented<Sym>
                label="Sell"
                value={sell}
                onChange={(s) => {
                  setSell(s);
                  setAmount("");
                  setPhase({ k: "edit" });
                }}
                options={[
                  { value: "ETH", label: "Sell ETH" },
                  { value: "USDC", label: "Sell USDC" },
                ]}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowDownUp size={14} aria-hidden />}
                onClick={() => {
                  setSell(buy);
                  setAmount("");
                  setPhase({ k: "edit" });
                }}
              >
                Flip
              </Button>
            </div>
            <Field
              label={`You sell (${tIn.symbol})`}
              mono
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setPhase({ k: "edit" });
              }}
              error={amountError}
              hint={
                balances.data
                  ? `Balance: ${fmt(balances.data[sell], tIn.decimals)} ${tIn.symbol}`
                  : undefined
              }
              trailing={<span className="text-small text-muted">{tIn.symbol}</span>}
            />
            <div className="rounded-md border border-border bg-sunken p-4">
              <p className="text-caption font-medium uppercase tracking-[0.06em] text-muted">
                You receive (estimated)
              </p>
              {quotes.isFetching && !best ? (
                <Skeleton className="mt-2 h-8 w-40" />
              ) : best ? (
                <p className="mt-1 font-mono text-h2 tabular">
                  {fmt(best.amountOut, tOut.decimals)}{" "}
                  <span className="font-sans text-h3 text-muted">{tOut.symbol}</span>
                </p>
              ) : quotes.isError ? (
                <p className="mt-1 text-small text-danger">
                  Couldn't get a quote through the active route.
                </p>
              ) : quotes.data && !quotes.data.length ? (
                <p className="mt-1 text-small text-muted">No v4 pool could fill this size.</p>
              ) : (
                <p className="mt-1 text-small text-muted">
                  Enter an amount to get an on-chain quote.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium">Slippage tolerance</span>
                <Segmented<string>
                  label="Slippage tolerance"
                  size="sm"
                  value={String(slippageBps)}
                  onChange={(v) => setSlippageBps(Number(v))}
                  options={[10, 50, 100, 300].map((b) => ({
                    value: String(b),
                    label: `${b / 100}%`,
                  }))}
                />
              </div>
              <Field
                label="Deadline (minutes)"
                mono
                inputMode="numeric"
                value={String(deadlineMin)}
                onChange={(e) =>
                  setDeadlineMin(
                    Math.max(1, Math.min(180, Number(e.target.value.replace(/\D/g, "")) || 1)),
                  )
                }
              />
            </div>
            {status !== "unlocked" ? (
              <Callout
                title={status === "none" ? "Create a wallet to swap" : "Unlock your wallet to swap"}
              >
                <TextLink to="/wallet">Go to Wallet</TextLink>
              </Callout>
            ) : phase.k === "edit" || phase.k === "error" ? (
              <div className="flex flex-col gap-3">
                {phase.k === "error" && (
                  <Callout tone="danger" title="Swap not sent">
                    {phase.message}
                  </Callout>
                )}
                <div>
                  <Button
                    variant="primary"
                    disabled={!best || !amountIn || amountIn !== debounced}
                    onClick={() => void review()}
                  >
                    {sell === "ETH" ? "Review swap" : "Approve and review"}
                  </Button>
                </div>
                {sell === "USDC" && (
                  <p className="text-caption text-muted">
                    Selling a token takes up to two steps first: an on-chain approval of exactly
                    this amount to Permit2 (if not already approved), then a Permit2 signature for
                    the Universal Router, which costs no gas.
                  </p>
                )}
              </div>
            ) : phase.k === "working" ? (
              <p role="status" className="text-small text-muted">
                {phase.step}
              </p>
            ) : phase.k === "review" ? (
              <ReviewView
                p={phase}
                tIn={tIn}
                tOut={tOut}
                ack={ack}
                setAck={setAck}
                onSwap={() => void swap(phase)}
                onCancel={() => setPhase({ k: "edit" })}
              />
            ) : (
              <div role="status" className="flex flex-col gap-3">
                <Callout title="Swap confirmed">
                  <span className="break-all font-mono text-caption">{phase.hash}</span>
                </Callout>
                <div>
                  <Button
                    onClick={() => {
                      setPhase({ k: "edit" });
                      setAmount("");
                    }}
                  >
                    New swap
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Route and pools" flush>
          {!debounced ? (
            <EmptyState title="Quotes appear here">
              Selfnode asks the Uniswap v4 Quoter contract for every standard fee tier and picks the
              best output.
            </EmptyState>
          ) : quotes.isPending ? (
            <div className="flex flex-col gap-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Pool fee
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right font-medium">
                      Output
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      Price impact
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(quotes.data ?? []).map((q, i) => (
                    <tr key={q.key.fee}>
                      <td className="px-5 py-3">
                        {feePct(q.key.fee)} {i === 0 && <Badge tone="verified">Best</Badge>}
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular">
                        {fmt(q.amountOut, tOut.decimals)} {tOut.symbol}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular">
                        {pct(q.priceImpactBps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-5 py-3 text-caption text-muted">
                Price impact includes the pool fee and is measured against the pool's spot price
                (StateView). ETH ⇄ USDC pools, no hooks.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </Page>
  );
}

function ReviewView({
  p,
  tIn,
  tOut,
  ack,
  setAck,
  onSwap,
  onCancel,
}: {
  p: Extract<Phase, { k: "review" }>;
  tIn: (typeof TOKENS)[Sym];
  tOut: (typeof TOKENS)[Sym];
  ack: boolean;
  setAck: (v: boolean) => void;
  onSwap: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lead font-medium">
        Swap {fmt(p.quote.amountIn, tIn.decimals)} {tIn.symbol} for at least{" "}
        {fmt(p.minOut, tOut.decimals)} {tOut.symbol} on Uniswap v4
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-md border border-border bg-sunken p-4 text-small">
        <dt className="text-muted">Expected</dt>
        <dd className="font-mono tabular">
          {fmt(p.quote.amountOut, tOut.decimals)} {tOut.symbol}
        </dd>
        <dt className="text-muted">Minimum received</dt>
        <dd className="font-mono tabular">
          {fmt(p.minOut, tOut.decimals)} {tOut.symbol}
        </dd>
        <dt className="text-muted">Pool</dt>
        <dd>ETH/USDC · {feePct(p.quote.key.fee)} fee</dd>
        <dt className="text-muted">Price impact</dt>
        <dd className="font-mono tabular">{pct(p.quote.priceImpactBps)}</dd>
        <dt className="text-muted">Simulation</dt>
        <dd>
          <Badge tone="verified">Succeeds</Badge>
        </dd>
        <dt className="text-muted">Network fee</dt>
        <dd className="font-mono tabular">up to {fmt(p.maxCost, 18, 8)} ETH</dd>
        <dt className="text-muted">Contract</dt>
        <dd className="font-mono text-caption">
          Universal Router {uniswapSepolia.universalRouter.slice(0, 10)}…
        </dd>
      </dl>
      {p.warnings.map((w) => (
        <Callout
          key={w.message}
          tone={w.level === "info" ? "info" : w.level === "warning" ? "warning" : "danger"}
          title={w.message}
        />
      ))}
      {p.needsAck && p.canSwap && (
        <label className="flex min-h-11 items-center gap-3 text-small">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="size-4"
          />
          I understand the warnings and still want to swap.
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={!p.canSwap || (p.needsAck && !ack)} onClick={onSwap}>
          Sign and swap
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
