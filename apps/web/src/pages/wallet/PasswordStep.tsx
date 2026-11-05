import { MIN_PASSWORD_LENGTH } from "@selfnode/core";
import { useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Field } from "../../ui/Field";

/** Choose a password and seal the vault. Shows scrypt progress (it's deliberately slow). */
export function PasswordStep({
  onSubmit,
  cta,
}: {
  onSubmit: (password: string, onProgress: (f: number) => void) => Promise<void>;
  cta: string;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tooShort = pw.length > 0 && pw.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== pw;
  const ok = pw.length >= MIN_PASSWORD_LENGTH && pw === confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setError(null);
    setProgress(0);
    try {
      await onSubmit(pw, setProgress);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-md flex-col gap-5">
      <p className="text-small text-muted">
        This password encrypts your wallet on this device. It can't be recovered. If you forget it,
        you'll need your recovery phrase.
      </p>
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words work well.`}
        error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters` : undefined}
      />
      <Field
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "Passwords don't match" : undefined}
      />
      {error && (
        <Callout tone="danger" title="Couldn't create the wallet">
          {error}
        </Callout>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={!ok} busy={progress !== null}>
          {progress !== null ? `Encrypting… ${Math.round(progress * 100)}%` : cta}
        </Button>
      </div>
    </form>
  );
}
