/**
 * Show the recovery phrase (or private key) again after setup. Needs the
 * password every time, even though the wallet is unlocked: it decrypts the
 * vault afresh rather than using the unlocked session. The secret lives only
 * in this component's state and is dropped on Hide, after two minutes, when
 * the wallet locks (this component unmounts) or when the page is hidden.
 */
import { WrongPasswordError } from "@selfnode/core";
import { useEffect, useState, type FormEvent } from "react";
import { useWallet } from "../../state/wallet";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Field } from "../../ui/Field";
import { PhraseWords } from "./PhraseWords";

const AUTO_HIDE_MS = 120_000;

export function RevealSecret() {
  const { reveal, kind } = useWallet();
  const what = kind === "mnemonic" ? "recovery phrase" : "private key";
  const [step, setStep] = useState<"idle" | "password">("idle");
  const [pw, setPw] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const hide = () => {
    setSecret(null);
    setStep("idle");
  };

  // Auto-hide, and hide whenever the tab is hidden.
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(hide, AUTO_HIDE_MS);
    const onVis = () => document.visibilityState === "hidden" && hide();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [secret]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setProgress(0);
    try {
      const s = await reveal(pw, setProgress);
      setSecret(s.value);
    } catch (err) {
      setError(
        err instanceof WrongPasswordError
          ? err.message
          : `Couldn't decrypt: ${(err as Error).message}`,
      );
    } finally {
      setPw("");
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <p className="text-small font-medium">Show {what}</p>
      {secret ? (
        <>
          <Callout tone="warning" title="Anyone who sees this can take your funds">
            Make sure no one is watching your screen. It hides itself after two minutes.
          </Callout>
          {kind === "mnemonic" ? (
            <PhraseWords phrase={secret} />
          ) : (
            <p className="break-all rounded-md border border-border bg-sunken p-4 font-mono text-small">
              {secret}
            </p>
          )}
          <div>
            <Button onClick={hide}>Hide</Button>
          </div>
        </>
      ) : step === "password" ? (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <p className="text-caption text-muted">
            Enter your password again to decrypt it. Make sure no one can see your screen.
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
              {progress !== null ? `Decrypting… ${Math.round(progress * 100)}%` : `Show ${what}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPw("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-caption text-muted">
            For writing it down again or moving to another wallet. Needs your password.
          </p>
          <div>
            <Button onClick={() => setStep("password")}>Show {what}…</Button>
          </div>
        </>
      )}
    </div>
  );
}
