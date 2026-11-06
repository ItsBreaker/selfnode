/** All wallets on this device: switch, rename, add a wallet, add an account from the phrase. */
import { shortHex, WrongPasswordError } from "@selfnode/core";
import { useState, type FormEvent } from "react";
import { useWallet } from "../../state/wallet";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

export function WalletsPanel({ onAdd }: { onAdd: () => void }) {
  const { accounts, active, status, kind, switchTo, rename, addAccount } = useWallet();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [pw, setPw] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setProgress(0);
    try {
      await addAccount(pw, setProgress);
      setAdding(false);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? err.message : (err as Error).message);
    } finally {
      setPw("");
      setProgress(null);
    }
  };

  return (
    <Panel
      title={`Wallets on this device (${accounts.length})`}
      flush
      actions={
        <Button size="sm" onClick={onAdd}>
          Add wallet
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {accounts.map((a) => {
          const isActive = a.id === active?.id;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-small">
              {editing === a.id ? (
                <form
                  className="flex flex-1 flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(a.id, name);
                    setEditing(null);
                  }}
                >
                  <Field
                    className="min-w-48 flex-1"
                    label={`New name for ${a.name}`}
                    value={name}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      {isActive && (
                        <Badge tone="private">
                          {status === "unlocked" ? "Active · unlocked" : "Active · locked"}
                        </Badge>
                      )}
                      {a.index > 0 && <Badge>account {a.index + 1} of its phrase</Badge>}
                    </span>
                    <span className="font-mono text-caption text-muted">{shortHex(a.address)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(a.id);
                      setName(a.name);
                    }}
                  >
                    Rename
                  </Button>
                  {!isActive && (
                    <Button size="sm" onClick={() => switchTo(a.id)}>
                      Switch
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {status === "unlocked" && kind === "mnemonic" && (
        <div className="border-t border-border p-5">
          {adding ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => void submitAccount(e)}>
              <p className="text-caption text-muted">
                Derives the next account from {active?.name}&apos;s recovery phrase (same phrase,
                new address). Enter the password to decrypt it.
              </p>
              <Field
                label="Password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                error={error ?? undefined}
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="primary" disabled={!pw} busy={progress !== null}>
                  {progress !== null ? `Decrypting… ${Math.round(progress * 100)}%` : "Add account"}
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add an account from this recovery phrase
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
