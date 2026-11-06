/** A recovery phrase as a numbered grid of words. */
export function PhraseWords({ phrase }: { phrase: string }) {
  return (
    <ol className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-4 sm:grid-cols-3">
      {phrase.split(" ").map((w, i) => (
        <li
          key={i}
          className="flex items-baseline gap-2 rounded-sm bg-sunken px-3 py-2 font-mono text-small"
        >
          <span className="w-5 text-right text-caption text-muted tabular">{i + 1}</span>
          <span className="text-text">{w}</span>
        </li>
      ))}
    </ol>
  );
}
