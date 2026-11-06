import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AUTOLOCK_OPTIONS, useWallet } from "../../state/wallet";
import { activityStore } from "../../storage/db";
import { Address } from "../../ui/Address";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/Callout";
import { Field } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { Segmented } from "../../ui/Segmented";
import { BalancesPanel } from "./BalancesPanel";
import { RevealSecret } from "./RevealSecret";
import { SendFlow } from "./SendFlow";

function ActivityPanel() {
  const q = useQuery({ queryKey: ["activity"], queryFn: activityStore.list });
  return (
    <Panel title="Sent from this device" flush>
      {!q.data?.length ? (
        <EmptyState title="No transactions yet">
          Transactions you send from Selfnode on this device appear here. Full address history needs
          an archive node.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((a) => (
            <li
              key={a.hash}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-small"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-medium">{a.amount}</span>
                <span className="text-muted">to</span>
                <Address address={a.to} />
              </span>
              <Badge
                tone={
                  a.status === "confirmed"
                    ? "verified"
                    : a.status === "failed"
                      ? "danger"
                      : "warning"
                }
              >
                {a.status === "confirmed"
                  ? "Confirmed"
                  : a.status === "failed"
                    ? "Failed"
                    : "Pending"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SecurityPanel() {
  const { lock, remove, autoLockMinutes, setAutoLockMinutes, kind } = useWallet();
  const [confirm, setConfirm] = useState("");
  return (
    <Panel title="Security">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-small font-medium">Lock after inactivity</p>
            <p className="text-caption text-muted">
              The decrypted key is wiped from memory when the wallet locks.
            </p>
          </div>
          <Segmented<string>
            label="Auto-lock after"
            value={String(autoLockMinutes)}
            onChange={(v) => setAutoLockMinutes(Number(v))}
            options={AUTOLOCK_OPTIONS.map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </div>
        <div>
          <Button onClick={lock}>Lock now</Button>
        </div>
        <RevealSecret />
        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <p className="text-small font-medium">Remove wallet from this device</p>
          <p className="text-caption text-muted">
            Deletes the encrypted {kind === "mnemonic" ? "recovery phrase" : "private key"} and
            local activity. You'll need your{" "}
            {kind === "mnemonic" ? "recovery phrase" : "private key"} to restore it.
          </p>
          <Field
            label='Type "remove" to confirm'
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <div>
            <Button
              variant="danger"
              disabled={confirm.trim().toLowerCase() !== "remove"}
              onClick={() => void remove()}
            >
              Remove wallet
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function WalletHome() {
  const { address } = useWallet();
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-5">
        <Panel title="Receive">
          {address && (
            <div className="flex flex-col gap-2">
              <Address address={address} />
              <p className="break-all font-mono text-caption text-muted">{address}</p>
            </div>
          )}
        </Panel>
        <BalancesPanel />
        <ActivityPanel />
      </div>
      <div className="flex flex-col gap-5">
        <Panel title="Send">
          <SendFlow />
        </Panel>
        <SecurityPanel />
      </div>
    </div>
  );
}
