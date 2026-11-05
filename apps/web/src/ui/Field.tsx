import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  mono?: boolean;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, mono, trailing, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-small font-medium text-text">
        {label}
      </label>
      <div
        className={cx(
          "flex items-center rounded-md border bg-surface",
          error ? "border-danger" : "border-border-strong",
          "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus",
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          {...rest}
          className={cx(
            "h-10 w-full min-w-0 bg-transparent px-3 text-body text-text placeholder:text-muted outline-none",
            "focus-visible:outline-none",
            mono && "font-mono text-small tabular",
          )}
        />
        {trailing && <div className="pr-2">{trailing}</div>}
      </div>
      {(error || hint) && (
        <p id={hintId} className={cx("text-small", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
