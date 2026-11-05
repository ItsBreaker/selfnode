/**
 * Send ETH or a token on Sepolia: form → plain-English preview → sign → broadcast.
 * Signing goes through core/wallet/signer (testnet-only); broadcast goes through
 * the router, which always uses Anon-RPC for eth_sendRawTransaction.
 */
import {
  assessSend,
  builtinTokens,
  chains,
  formatAmount,
  gatherSendFacts,
  signTransaction,
  type Asset,
  type SendPreview,
  type SendRequest,
} from "@selfnode/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getAddress,
  isAddress,
  parseUnits,
  type Hex,
  type TransactionSerializableEIP1559,
} from "viem";
import { labelUrl, useMirror } from "../../state/labels";
import { usePublicClient, useSelfnode } from "../../state/selfnode";
import { useWallet } from "../../state/wallet";
import { activityStore } from "../../storage/db";
import { Address } from "../../ui/Address";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Field } from "../../ui/Field";
import { cx } from "../../ui/cx";

type Phase =
  | { k: "form" }
  | { k: "preparing" }
  | {
      k: "review";
      req: SendRequest;
      preview: SendPreview;
      tx: TransactionSerializableEIP1559 | null;
    }
  | { k: "sending"; step: string }
  | { k: "done"; hash: Hex; status: "pending" | "confirmed" | "failed" }
  | { k: "error"; message: string };

const ETH: Asset = { kind: "native", symbol: "ETH", decimals: 18 };
const fmt = (v: bigint, d: number, max = 6) => {
  const f = formatAmount(v, d, max);
  return f.whole === "0" && !f.fraction && f.truncated
    ? `< 0.${"0".repeat(max - 1)}1`
    : `${f.whole}${f.fraction ? `.${f.fraction}` : ""}`;
};

export function SendFlow() {
  const { settings } = useSelfnode();
  const { session, address } = useWallet();
  const client = usePublicClient();
  const mirror = useMirror();
  const qc = useQueryClient();
  const chain = chains[settings.chain];
  const assets: Asset[] = [
    ETH,
    ...builtinTokens[settings.chain].map((t) => ({
      kind: "erc20" as const,
      address: t.address,
      symbol: t.symbol,
      decimals: t.decimals,
    })),
  ];
  const [assetIdx, setAssetIdx] = useState(0);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "form" });
  const asset = assets[assetIdx] ?? ETH;

  if (!chain.testnet) {
    return (
      <Callout tone="info" title={`Sending is disabled on ${chain.name}`}>
        This build only signs on Sepolia. Switch the network in Settings to send.
      </Callout>
    );
  }

  const toError =
    to && !isAddress(to, { strict: false })
      ? "Enter a 0x address"
      : to && !isAddress(to)
        ? "This address has an invalid checksum; check for typos"
        : undefined;
  let parsed: bigint | null = null;
  let amountError: string | undefined;
  if (amount) {
    try {
      parsed = parseUnits(amount.trim(), asset.decimals);
      if (!/^\d*\.?\d*$/.test(amount.trim())) throw new Error();
    } catch {
      amountError = `Enter a number with at most ${asset.decimals} decimals`;
      parsed = null;
    }
  }

  const review = async () => {
    if (!address || parsed === null || toError) return;
    setAck(false);
    setPhase({ k: "preparing" });
    const req: SendRequest = {
      chain: settings.chain,
      from: address,
      to: getAddress(to),
      asset,
      amount: parsed,
    };
    try {
      // Recipient label from the Arkiv mirror (through Anon-RPC); a lookup failure never blocks a send.
      const facts = await gatherSendFacts(client, req, async (a) => {
        const l = await mirror.label(chain.id, a);
        if (!l) return null;
        return {
          name: l.name,
          category: l.category,
          source: l.source,
          url: labelUrl(l),
          ...(l.note ? { note: l.note } : {}),
        };
      });
      const { preview, tx } = assessSend(req, facts);
      setPhase({ k: "review", req, preview, tx });
    } catch (e) {
      setPhase({
        k: "error",
        message: (e as Error).message.split("\n")[0] ?? "Couldn't prepare the transaction",
      });
    }
  };

  const send = async (req: SendRequest, tx: TransactionSerializableEIP1559) => {
    if (!session)
      return setPhase({ k: "error", message: "The wallet locked. Unlock it and try again." });
    try {
      setPhase({ k: "sending", step: "Signing on this device…" });
      const raw = await signTransaction(session, tx);
      // Every mode broadcasts through Anon-RPC (enforced by the router).
      setPhase({ k: "sending", step: "Broadcasting through the anonymity network…" });
      const hash = await client.sendRawTransaction({ serializedTransaction: raw });
      await activityStore.put({
        hash,
        chain: settings.chain,
        from: req.from,
        to: req.to,
        amount: `${fmt(req.amount, req.asset.decimals)} ${req.asset.symbol}`,
        status: "pending",
        createdAt: Date.now(),
      });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      setPhase({ k: "done", hash, status: "pending" });
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: 300_000,
        pollingInterval: 4_000,
      });
      const status = receipt.status === "success" ? "confirmed" : "failed";
      await activityStore.put({
        hash,
        chain: settings.chain,
        from: req.from,
        to: req.to,
        amount: `${fmt(req.amount, req.asset.decimals)} ${req.asset.symbol}`,
        status,
        createdAt: Date.now(),
        blockNumber: receipt.blockNumber.toString(),
      });
      void qc.invalidateQueries({ queryKey: ["activity"] });
      void qc.invalidateQueries({ queryKey: ["balances"] });
      setPhase({ k: "done", hash, status });
    } catch (e) {
      setPhase({
        k: "error",
        message: `${(e as Error).message.split("\n")[0]}. Nothing was sent directly; Selfnode never falls back.`,
      });
    }
  };

  if (phase.k === "review") {
    const { preview, req, tx } = phase;
    return (
      <div className="flex flex-col gap-5">
        <PreviewView preview={preview} />
        {preview.needsAcknowledgement && preview.canSend && (
          <label className="flex min-h-11 items-center gap-3 text-small">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="size-4"
            />
            I've read the warnings above and still want to send.
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={!tx || (preview.needsAcknowledgement && !ack)}
            onClick={() => tx && void send(req, tx)}
          >
            Sign and send
          </Button>
          <Button onClick={() => setPhase({ k: "form" })}>Edit</Button>
        </div>
      </div>
    );
  }
  if (phase.k === "sending" || phase.k === "preparing") {
    return (
      <p className="flex items-center gap-2 text-small text-muted" role="status">
        {phase.k === "preparing"
          ? "Checking the transaction through your active route…"
          : phase.step}
      </p>
    );
  }
  if (phase.k === "done") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <Callout
          tone={phase.status === "failed" ? "danger" : "info"}
          title={
            phase.status === "pending"
              ? "Sent. Waiting for it to be included…"
              : phase.status === "confirmed"
                ? "Confirmed"
                : "The transaction failed on-chain"
          }
        >
          <span className="break-all font-mono text-caption">{phase.hash}</span>
        </Callout>
        <div>
          <Button
            onClick={() => {
              setPhase({ k: "form" });
              setAmount("");
            }}
          >
            New transfer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void review();
      }}
    >
      {phase.k === "error" && (
        <Callout tone="danger" title="Couldn't send">
          {phase.message}
        </Callout>
      )}
      <div className="flex flex-col gap-1.5">
        <span id="asset-label" className="text-small font-medium">
          Asset
        </span>
        <div role="radiogroup" aria-labelledby="asset-label" className="flex flex-wrap gap-2">
          {assets.map((a, i) => (
            <button
              key={a.symbol}
              type="button"
              role="radio"
              aria-checked={i === assetIdx}
              onClick={() => setAssetIdx(i)}
              className={cx(
                "h-11 rounded-md border px-4 text-small font-medium sm:h-9",
                i === assetIdx
                  ? "border-accent bg-surface shadow-[0_0_0_1px_var(--accent)]"
                  : "border-border text-muted hover:border-border-strong",
              )}
            >
              {a.symbol}
            </button>
          ))}
        </div>
      </div>
      <Field
        label="Recipient"
        mono
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
        error={toError}
      />
      <Field
        label="Amount"
        mono
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={amountError}
        trailing={<span className="text-small text-muted">{asset.symbol}</span>}
      />
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={!to || !!toError || parsed === null || parsed === 0n}
        >
          Review
        </Button>
      </div>
    </form>
  );
}

function PreviewView({ preview }: { preview: SendPreview }) {
  const sim = preview.simulation;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lead font-medium">{preview.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-md border border-border bg-sunken p-4 text-small">
        <dt className="text-muted">Recipient</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <Address
            address={preview.recipient.address}
            label={
              preview.recipient.label
                ? {
                    name: preview.recipient.label.name,
                    source: preview.recipient.label.source,
                    fromArkiv: true,
                  }
                : undefined
            }
          />
          {preview.recipient.isContract && <Badge>Contract</Badge>}
          {preview.recipient.isNew && <Badge tone="warning">New address</Badge>}
        </dd>
        {preview.call && (
          <>
            <dt className="text-muted">Call</dt>
            <dd className="font-mono text-caption">
              transfer(to: {preview.call.args.to.slice(0, 10)}…, amount: {preview.call.args.amount})
              on {preview.call.contract.slice(0, 10)}…
            </dd>
          </>
        )}
        <dt className="text-muted">Simulation</dt>
        <dd>
          {sim.ok ? (
            <Badge tone="verified">Succeeds</Badge>
          ) : (
            <Badge tone="danger">Would fail</Badge>
          )}
        </dd>
        <dt className="text-muted">Network fee</dt>
        <dd className="font-mono tabular">up to {fmt(preview.fee.maxCost, 18, 8)} ETH</dd>
        <dt className="text-muted">Network</dt>
        <dd>Sepolia (testnet). Broadcast through the anonymity network.</dd>
      </dl>
      {preview.warnings.map((w) => (
        <Callout
          key={w.message}
          tone={w.level === "info" ? "info" : w.level === "warning" ? "warning" : "danger"}
          title={w.message}
        />
      ))}
    </div>
  );
}
