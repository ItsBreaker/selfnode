import { generateMnemonic } from "@selfnode/core";
import { useMemo, useState } from "react";
import { useWallet } from "../../state/wallet";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Field } from "../../ui/Field";
import { PasswordStep } from "./PasswordStep";
import { PhraseWords } from "./PhraseWords";

type Step = "show" | "confirm" | "password";

/** Three distinct random word positions to confirm, from the CSPRNG. */
function pickPositions(): number[] {
  const out = new Set<number>();
  const r = new Uint32Array(8);
  while (out.size < 3) {
    crypto.getRandomValues(r);
    for (const v of r) if (out.size < 3) out.add(v % 12);
  }
  return [...out].sort((a, b) => a - b);
}

export function CreateWallet({ onCancel }: { onCancel: () => void }) {
  const { create } = useWallet();
  const [mnemonic, setMnemonic] = useState(generateMnemonic);
  const words = mnemonic.split(" ");
  const positions = useMemo(pickPositions, [mnemonic]);
  const [step, setStep] = useState<Step>("show");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const confirmed = positions.every((p) => answers[p]?.trim().toLowerCase() === words[p]);

  if (step === "show") {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <Callout tone="warning" title="Write these 12 words down, in order">
          They're the only way to recover this wallet. Anyone who sees them can take your funds.
          Selfnode will never ask for them again.
        </Callout>
        <PhraseWords phrase={mnemonic} />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setStep("confirm")}>
            I've written them down
          </Button>
          <Button onClick={() => setMnemonic(generateMnemonic())}>New phrase</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <form
        className="flex max-w-md flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed) setStep("password");
        }}
      >
        <p className="text-small text-muted">
          To check you have them, enter these words from your phrase.
        </p>
        {positions.map((p) => (
          <Field
            key={p}
            label={`Word ${p + 1}`}
            mono
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={answers[p] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [p]: e.target.value }))}
          />
        ))}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={!confirmed}>
            Continue
          </Button>
          <Button variant="ghost" onClick={() => setStep("show")}>
            Show the words again
          </Button>
        </div>
      </form>
    );
  }

  return (
    <PasswordStep
      cta="Create wallet"
      onSubmit={async (pw, onProgress) => {
        await create({ kind: "mnemonic", value: mnemonic }, pw, onProgress);
        setMnemonic(""); // drop the phrase from component state
      }}
    />
  );
}
