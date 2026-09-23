import type { RefObject } from "react";
import type { EvaluationClientError } from "./evaluation-api-client";

interface EvaluationErrorPanelProps {
  readonly error: EvaluationClientError;
  readonly canRetry: boolean;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onRetry: () => void;
}

export function EvaluationErrorPanel({
  error,
  canRetry,
  headingRef,
  onRetry,
}: EvaluationErrorPanelProps) {
  return (
    <section className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-surface)] p-6 sm:p-8">
      <p className="text-sm font-semibold text-[var(--error)]">
        Analysis unavailable
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] outline-none focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]"
      >
        Your draft is still here.
      </h2>
      <p className="mt-3 max-w-xl leading-7 text-[var(--text-muted)]">
        {error.message}
      </p>
      {error.retryable ? (
        <button
          type="button"
          disabled={!canRetry}
          onClick={onRetry}
          className="mt-6 min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-[var(--text-primary)] transition-[background-color,transform] duration-150 hover:bg-[var(--surface-muted)] active:translate-y-px disabled:cursor-not-allowed disabled:text-[var(--text-subtle)]"
        >
          Try again
        </button>
      ) : null}
    </section>
  );
}
