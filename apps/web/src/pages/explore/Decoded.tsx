import { decodeWithCandidates, formatAmount, type DecodedCall } from "@selfnode/core";
import { BadgeCheck } from "lucide-react";
import { useMemo } from "react";
import { decodeFunctionData, erc20Abi, erc721Abi, formatEther, type Hex } from "viem";
import { labelUrl, useSignature } from "../../state/labels";
import { Badge } from "../../ui/Badge";
import { LabeledAddress } from "../../ui/LabeledAddress";

/** Built-in fallback for the most common standards, if the mirror lacks them. */
function decodeBuiltin(data: Hex): DecodedCall | null {
  for (const abi of [erc20Abi, erc721Abi]) {
    try {
      const d = decodeFunctionData({ abi, data });
      const item = abi.find(
        (x) =>
          x.type === "function" &&
          x.name === d.functionName &&
          x.inputs.length === (d.args?.length ?? 0),
      );
      if (!item || item.type !== "function") continue;
      return {
        signature: `${d.functionName}(${item.inputs.map((i) => i.type).join(",")})`,
        functionName: d.functionName,
        args: item.inputs.map((inp, i) => ({
          name: inp.name || `arg${i}`,
          type: inp.type,
          value: (d.args ?? [])[i],
        })),
      };
    } catch {
      /* not this standard */
    }
  }
  return null;
}

export function useDecodedCall(data: Hex | undefined) {
  const selector = data && data.length >= 10 ? data.slice(0, 10) : null;
  const sig = useSignature(selector);
  return useMemo(() => {
    if (!data || !selector) return { state: "none" as const };
    if (sig.isPending) return { state: "loading" as const, selector };
    const fromMirror = sig.data ? decodeWithCandidates(data, sig.data.texts) : null;
    if (fromMirror)
      return { state: "decoded" as const, selector, call: fromMirror, provenance: sig.data };
    const builtin = decodeBuiltin(data);
    if (builtin) return { state: "decoded" as const, selector, call: builtin, provenance: null };
    return { state: "unknown" as const, selector, mirrorError: sig.isError };
  }, [data, selector, sig.isPending, sig.data, sig.isError]);
}

/** Short method name for tables. */
export function MethodName({ data }: { data: Hex | undefined }) {
  const d = useDecodedCall(data);
  if (d.state === "none") return <span className="text-muted">ETH transfer</span>;
  if (d.state === "decoded")
    return <span className="font-mono text-caption">{d.call.functionName}</span>;
  return <span className="font-mono text-caption text-muted">{d.selector}</span>;
}

function Value({ type, value }: { type: string; value: unknown }) {
  if (type === "address" && typeof value === "string") return <LabeledAddress address={value} />;
  if (typeof value === "bigint") {
    return (
      <span className="break-all font-mono text-caption tabular" title={value.toString()}>
        {value.toString()}
        {type.startsWith("uint") && value > 10n ** 15n && (
          <span className="ml-2 text-muted">≈ {formatEther(value)} × 10¹⁸</span>
        )}
      </span>
    );
  }
  return (
    <span className="break-all font-mono text-caption">
      {JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))}
    </span>
  );
}

export function DecodedCallView({ data }: { data: Hex }) {
  const d = useDecodedCall(data);
  if (d.state === "none")
    return <p className="text-small text-muted">No calldata (plain ETH transfer).</p>;
  if (d.state === "loading")
    return <p className="text-small text-muted">Looking up {d.selector} in the Arkiv mirror…</p>;
  if (d.state === "unknown") {
    return (
      <p className="text-small text-muted">
        Unknown function <span className="font-mono">{d.selector}</span>
        {d.mirrorError
          ? " (the Arkiv mirror couldn't be reached)."
          : ". It isn't in the mirrored signature list."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-small font-medium">{d.call.signature}</span>
        {d.provenance ? (
          <a
            href={labelUrl(d.provenance)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-caption text-verified"
          >
            <BadgeCheck size={13} aria-hidden /> name from Arkiv · {d.provenance.source}
          </a>
        ) : (
          <Badge>built-in ABI</Badge>
        )}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
        {d.call.args.map((a, i) => (
          <div key={i} className="contents">
            <dt className="font-mono text-caption text-muted">
              {a.name} <span className="opacity-70">{a.type}</span>
            </dt>
            <dd className="min-w-0">
              <Value type={a.type} value={a.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export const fmtUnits = (v: bigint, d: number, max = 6) => {
  const f = formatAmount(v, d, max);
  return f.whole === "0" && !f.fraction && f.truncated
    ? `< 0.${"0".repeat(max - 1)}1`
    : `${f.whole}${f.fraction ? `.${f.fraction}` : ""}`;
};
