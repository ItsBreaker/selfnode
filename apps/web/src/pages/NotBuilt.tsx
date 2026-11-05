/** Honest placeholder for routes that are planned but not built yet. */
export function NotBuilt({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <h1 className="text-h1">{title}</h1>
      <p className="mt-2 max-w-prose text-body text-muted">
        This page isn't built yet. It arrives later in this build.
      </p>
    </div>
  );
}
