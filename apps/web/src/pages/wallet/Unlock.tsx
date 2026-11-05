import { shortHex, WrongPasswordError } from "@selfnode/core";
import { useState, type FormEvent } from "react";
import { useWallet } from "../../state/wallet";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";

export function Unlock() {
  const { unlock, address } = useWallet();
  const [pw, setPw] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setProgress(0);
    try {
      await unlock(pw, setProgress);
      setPw("");
    } catch (err) {
      setError(
        err instanceof WrongPasswordError
          ? err.message
          : `Couldn't unlock: ${(err as Error).message}`,
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-md flex-col gap-5">
      <p className="text-small text-muted">
        Wallet <span className="font-mono text-text">{address ? shortHex(address) : ""}</span> is
        locked.
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
      <div>
        <Button type="submit" variant="primary" disabled={!pw} busy={progress !== null}>
          {progress !== null ? `Unlocking… ${Math.round(progress * 100)}%` : "Unlock"}
        </Button>
      </div>
    </form>
  );
}
