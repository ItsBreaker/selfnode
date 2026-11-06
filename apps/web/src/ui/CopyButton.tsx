import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "./cx";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true))}
      aria-label={copied ? "Copied" : label}
      className={cx(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-text",
        // Invisible 44 px hit area around the 24 px icon.
        "after:absolute after:-inset-2.5 after:content-['']",
        className,
      )}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span role="status" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
