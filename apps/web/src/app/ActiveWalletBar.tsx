/** The active wallet, on every page (when there is one). */
import { shortHex } from "@selfnode/core";
import { Link } from "react-router";
import { useWallet } from "../state/wallet";

export function ActiveWalletBar() {
  const { active, accounts, status } = useWallet();
  if (!active) return null;
  return (
    <div className="border-b border-border bg-sunken">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-5 py-1.5 text-caption text-muted">
        <span>Wallet:</span>
        <span className="font-medium text-text">{active.name}</span>
        <span className="font-mono">{shortHex(active.address)}</span>
        <span>· {status === "unlocked" ? "unlocked" : "locked"}</span>
        {accounts.length > 1 && (
          <Link to="/wallet" className="ml-auto underline underline-offset-2 hover:text-text">
            Switch wallet ({accounts.length})
          </Link>
        )}
      </p>
    </div>
  );
}
