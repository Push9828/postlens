export function EvaluationLoading() {
  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] sm:p-7"
      aria-label="Preparing evaluation results"
    >
      <div className="skeleton h-3 w-28 rounded" />
      <div className="mt-5 flex items-end gap-3">
        <div className="skeleton h-16 w-28 rounded-lg" />
        <div className="skeleton mb-2 h-6 w-20 rounded" />
      </div>
      <div className="skeleton mt-7 h-4 w-full rounded" />
      <div className="skeleton mt-3 h-4 w-4/5 rounded" />

      <div className="mt-9 grid gap-x-8 sm:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <div
            className="border-t border-[var(--border)] py-5"
            // Skeleton items have no semantic identity.
            key={`loading-dimension-${index + 1}`}
          >
            <div className="flex justify-between gap-4">
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-5 w-12 rounded" />
            </div>
            <div className="skeleton mt-4 h-3 w-full rounded" />
            <div className="skeleton mt-2 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
