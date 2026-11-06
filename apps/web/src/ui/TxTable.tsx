/**
 * Etherscan-style transaction rows: hash, method (decoded from Selfnode's Arkiv
 * mirror), from → to (labels, or ENS names), value, age, and optionally block.
 */
import type { TxRow } from "@selfnode/core";
import { Link } from "react-router";
import { MethodName } from "../pages/explore/Decoded";
import { Amount } from "./Amount";
import { LabeledAddress } from "./LabeledAddress";
import { age } from "./age";

export function TxTable({ rows, showBlock = false }: { rows: TxRow[]; showBlock?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed text-left text-small">
        <thead>
          <tr className="border-b border-border text-caption uppercase tracking-[0.06em] text-muted">
            <th scope="col" className="w-32 px-5 py-2.5 font-medium">
              Hash
            </th>
            <th scope="col" className="w-32 px-2 py-2.5 font-medium">
              Method
            </th>
            {showBlock && (
              <th scope="col" className="w-24 px-2 py-2.5 font-medium">
                Block
              </th>
            )}
            <th scope="col" className="px-2 py-2.5 font-medium">
              From → To
            </th>
            <th scope="col" className="w-32 px-2 py-2.5 text-right font-medium">
              Value
            </th>
            <th scope="col" className="w-24 px-5 py-2.5 text-right font-medium">
              Age
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((tx) => (
            <tr key={tx.hash}>
              <td className="px-5 py-2.5 font-mono text-caption">
                <Link
                  className="underline decoration-border-strong underline-offset-2"
                  to={`/explore/tx/${tx.hash}`}
                >
                  {tx.hash.slice(0, 10)}…
                </Link>
              </td>
              <td className="truncate px-2 py-2.5">
                <MethodName data={tx.input} />
              </td>
              {showBlock && (
                <td className="px-2 py-2.5 font-mono text-caption tabular">
                  <Link
                    className="underline decoration-border-strong underline-offset-2"
                    to={`/explore/block/${tx.blockNumber}`}
                  >
                    {tx.blockNumber.toLocaleString("en-US")}
                  </Link>
                </td>
              )}
              <td className="overflow-hidden px-2 py-2.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <LabeledAddress address={tx.from} ens />
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                  {tx.to ? (
                    <LabeledAddress address={tx.to} ens />
                  ) : (
                    <span className="text-muted">contract creation</span>
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right">
                <Amount value={tx.value} decimals={18} symbol="ETH" maxFraction={4} />
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right text-caption text-muted">
                {age(tx.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
