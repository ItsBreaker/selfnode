import {
  addressOfSecret,
  isValidMnemonic,
  normalizeMnemonic,
  parsePrivateKey,
  shortHex,
  type Secret,
} from "@selfnode/core";
import { useState } from "react";
import { useWallet } from "../../state/wallet";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Callout";
import { Segmented } from "../../ui/Segmented";
import { PasswordStep } from "./PasswordStep";

type Kind = Secret["kind"];

function validate(kind: Kind, value: string): string | null {
  if (!value.trim()) return null;
  if (kind === "mnemonic")
    return isValidMnemonic(value) ? null : "That isn't a valid 12- or 24-word recovery phrase";
  try {
    parsePrivateKey(value);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function ImportWallet({ onCancel }: { onCancel: () => void }) {
  const { create } = useWallet();
  const [kind, setKind] = useState<Kind>("mnemonic");
  const [value, setValue] = useState("");
  const [ready, setReady] = useState<{ secret: Secret; address: string } | null>(null);
  const error = validate(kind, value);

  if (ready) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-small text-muted">
          This will import <span className="font-mono text-text">{shortHex(ready.address)}</span>.
        </p>
        <PasswordStep
          cta="Import wallet"
          onSubmit={async (pw, onProgress) => {
            await create(ready.secret, pw, onProgress);
            setValue("");
            setReady(null);
          }}
        />
      </div>
    );
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (error || !value.trim()) return;
        const secret: Secret =
          kind === "mnemonic"
            ? { kind, value: normalizeMnemonic(value) }
            : { kind, value: value.trim() };
        void addressOfSecret(secret).then((address) => setReady({ secret, address }));
      }}
    >
      <Segmented<Kind>
        label="What are you importing?"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setValue("");
        }}
        options={[
          { value: "mnemonic", label: "Recovery phrase" },
          { value: "privateKey", label: "Private key" },
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="secret" className="text-small font-medium">
          {kind === "mnemonic" ? "Recovery phrase" : "Private key"}
        </label>
        <textarea
          id="secret"
          rows={kind === "mnemonic" ? 3 : 2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="rounded-md border border-border-strong bg-surface px-3 py-2.5 font-mono text-small text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          placeholder={kind === "mnemonic" ? "twelve words separated by spaces" : "0x…"}
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-small text-danger">{error}</p>}
      </div>
      <Callout title="Stays on this device">
        Selfnode encrypts it with your password and stores it only in this browser. It's never sent
        anywhere.
      </Callout>
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={!value.trim() || !!error}>
          Continue
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
