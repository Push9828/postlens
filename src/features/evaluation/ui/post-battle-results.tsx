import type { RefObject } from "react";
import type {
  ComparePostsResult,
  ComparisonSide,
  ComparisonSuccess,
} from "../application/compare-posts";
import { EVALUATION_DIMENSIONS } from "../domain/evaluation.types";
import { CONTENT_TYPE_LABELS, DIMENSION_LABELS } from "./score-copy";

export function BattleResult({
  result,
  isStale,
  headingRef,
  onRetry,
  canRetry,
}: {
  readonly result: ComparePostsResult;
  readonly isStale: boolean;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onRetry: () => void;
  readonly canRetry: boolean;
}) {
  const { A, B } = result.versions;
  const retryable =
    (A.status === "failure" && A.error.retryable) ||
    (B.status === "failure" && B.error.retryable);
  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] sm:p-7 lg:p-8"
      aria-labelledby="battle-heading"
    >
      <p className="text-sm font-semibold text-[var(--accent-text)]">
        Post Battle
      </p>
      <h2
        ref={headingRef}
        id="battle-heading"
        tabIndex={-1}
        className="mt-2 text-2xl font-semibold text-[var(--text-primary)] outline-none"
      >
        {result.status === "complete"
          ? "Comparison result"
          : "Comparison incomplete"}
      </h2>
      {isStale ? (
        <p className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-4 py-3 text-sm text-[var(--warning-text)]">
          A draft changed since this result. Compare again to reflect the
          current text.
        </p>
      ) : null}
      {result.status === "complete" ? (
        <CompleteResult result={result} />
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <SideResult label="Version A" side={A} />
          <SideResult label="Version B" side={B} />
        </div>
      )}
      {result.status !== "complete" && retryable ? (
        <RetryButton onRetry={onRetry} disabled={!canRetry} />
      ) : null}
      <p className="mt-6 text-sm leading-6 text-[var(--text-subtle)]">
        Scores describe the current PostLens rubric. They do not predict reach,
        engagement, or virality.
      </p>
    </section>
  );
}

function CompleteResult({
  result,
}: {
  readonly result: Extract<ComparePostsResult, { status: "complete" }>;
}) {
  const { A, B } = result.versions;
  const { comparison } = result;
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ScoreTile label="Version A" score={A.evaluation.overallScore} />
        <ScoreTile label="Version B" score={B.evaluation.overallScore} />
        <div className="rounded-lg bg-[var(--accent-soft)] p-4">
          <p className="text-xs font-semibold text-[var(--accent-text)]">
            B minus A
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
            {signed(comparison.overallDelta)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Post Potential points
          </p>
        </div>
      </div>
      <p className="mt-6 leading-7 text-[var(--text-primary)]">
        {comparison.summary}
      </p>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Rubric: {A.evaluation.rubric.id} v{A.evaluation.rubric.version}
      </p>
      <h3 className="mt-8 text-lg font-semibold text-[var(--text-primary)]">
        Dimension comparison
      </h3>
      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 bg-[var(--surface-muted)] px-3 py-3 text-xs font-semibold text-[var(--text-muted)] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_6rem] sm:px-4">
          <span>Dimension</span>
          <span className="text-right">A</span>
          <span className="text-right">B</span>
          <span className="text-right">B − A</span>
        </div>
        {EVALUATION_DIMENSIONS.map((dimension) => (
          <div
            key={dimension}
            className="border-t border-[var(--border)] px-3 py-3 sm:px-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_5rem_5rem_6rem]">
              <span className="min-w-0 font-medium text-[var(--text-primary)]">
                {DIMENSION_LABELS[dimension]}
              </span>
              <span className="text-right font-mono tabular-nums">
                <span className="sr-only">
                  Version A {DIMENSION_LABELS[dimension]}:{" "}
                  {A.evaluation.dimensions[dimension].score} out of 100
                </span>
                <span aria-hidden="true">
                  {A.evaluation.dimensions[dimension].score}
                </span>
              </span>
              <span className="text-right font-mono tabular-nums">
                <span className="sr-only">
                  Version B {DIMENSION_LABELS[dimension]}:{" "}
                  {B.evaluation.dimensions[dimension].score} out of 100
                </span>
                <span aria-hidden="true">
                  {B.evaluation.dimensions[dimension].score}
                </span>
              </span>
              <span className="text-right font-mono tabular-nums">
                <span className="sr-only">
                  {DIMENSION_LABELS[dimension]} delta, B minus A:{" "}
                  {signed(comparison.dimensionDeltas[dimension])}
                </span>
                <span aria-hidden="true">
                  {signed(comparison.dimensionDeltas[dimension])}
                </span>
              </span>
            </div>
            <details className="mt-2 text-sm text-[var(--text-muted)]">
              <summary className="cursor-pointer text-xs font-medium text-[var(--accent-text)]">
                Read both explanations
              </summary>
              <p className="mt-2">
                <strong>A:</strong>{" "}
                {A.evaluation.dimensions[dimension].explanation}
              </p>
              <p className="mt-1">
                <strong>B:</strong>{" "}
                {B.evaluation.dimensions[dimension].explanation}
              </p>
            </details>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <SideSummary label="Version A" side={A} />
        <SideSummary label="Version B" side={B} />
      </div>
    </>
  );
}

function SideResult({
  label,
  side,
}: {
  readonly label: string;
  readonly side: ComparisonSide;
}) {
  return side.status === "success" ? (
    <div className="rounded-lg bg-[var(--surface-muted)] p-4">
      <SideSummary label={label} side={side} />
      <ul className="mt-4 space-y-2">
        {EVALUATION_DIMENSIONS.map((dimension) => (
          <li key={dimension} className="text-sm">
            <div className="flex justify-between gap-3">
              <span>{DIMENSION_LABELS[dimension]}</span>
              <span className="font-mono tabular-nums">
                {side.evaluation.dimensions[dimension].score} / 100
              </span>
            </div>
            <p className="mt-1 text-[var(--text-muted)]">
              {side.evaluation.dimensions[dimension].explanation}
            </p>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <div className="rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4">
      <h3 className="font-semibold text-[var(--text-primary)]">
        {label} could not be evaluated
      </h3>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {side.error.message}
      </p>
    </div>
  );
}

function SideSummary({
  label,
  side,
}: {
  readonly label: string;
  readonly side: ComparisonSuccess;
}) {
  return (
    <div>
      <h3 className="font-semibold text-[var(--text-primary)]">{label}</h3>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {CONTENT_TYPE_LABELS[side.evaluation.contentType]} ·{" "}
        {side.evaluation.summary}
      </p>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Post Potential: {side.evaluation.overallScore} / 100
      </p>
    </div>
  );
}

function ScoreTile({
  label,
  score,
}: {
  readonly label: string;
  readonly score: number;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-muted)] p-4">
      <p className="text-xs font-semibold text-[var(--text-muted)]">
        {label} · Post Potential
      </p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
        <span className="sr-only">
          {label} Post Potential: {score} out of 100
        </span>
        <span aria-hidden="true">
          {score}{" "}
          <span className="text-sm text-[var(--text-subtle)]">/ 100</span>
        </span>
      </p>
    </div>
  );
}

export function RetryButton({
  onRetry,
  disabled,
}: {
  readonly onRetry: () => void;
  readonly disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={disabled}
      className="mt-6 min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed"
    >
      Compare both again
    </button>
  );
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
