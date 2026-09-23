import type { RefObject } from "react";
import type { EvaluatePostResult } from "../application/evaluate-post";
import { EVALUATION_DIMENSIONS } from "../domain/evaluation.types";
import { DimensionResult } from "./dimension-result";
import { CONTENT_TYPE_LABELS, DIMENSION_LABELS } from "./score-copy";

interface EvaluationResultsProps {
  readonly result: EvaluatePostResult;
  readonly isStale: boolean;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

export function EvaluationResults({
  result,
  isStale,
  headingRef,
}: EvaluationResultsProps) {
  const { evaluation } = result;
  const strongestLabel = DIMENSION_LABELS[evaluation.strongestDimension];
  const weakestLabel = DIMENSION_LABELS[evaluation.weakestDimension];
  const weakest = evaluation.dimensions[evaluation.weakestDimension];

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--panel-shadow)]"
      aria-labelledby="evaluation-heading"
    >
      <div className="p-5 sm:p-7 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--accent-text)]">
              Post Potential
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="sr-only">
                Post Potential: {evaluation.overallScore} out of 100
              </span>
              <p
                aria-hidden="true"
                className="font-mono text-6xl font-semibold tracking-[-0.08em] tabular-nums text-[var(--text-primary)] sm:text-7xl"
              >
                {evaluation.overallScore}
              </p>
              <p
                aria-hidden="true"
                className="mb-2 text-sm text-[var(--text-subtle)]"
              >
                / 100
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-text)]">
              {evaluation.scoreInterpretation.label}
            </span>
            <span className="text-xs text-[var(--text-subtle)]">
              {CONTENT_TYPE_LABELS[evaluation.contentType]}
            </span>
          </div>
        </div>

        <h2
          ref={headingRef}
          id="evaluation-heading"
          tabIndex={-1}
          className="mt-7 text-xl font-semibold tracking-tight text-[var(--text-primary)] outline-none focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]"
        >
          Your rubric result
        </h2>

        {isStale ? (
          <div className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--warning-text)]">
              Draft changed since this analysis
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Analyze again when you want this result to reflect the current
              draft.
            </p>
          </div>
        ) : null}

        <p className="mt-4 max-w-2xl leading-7 text-[var(--text-muted)]">
          {evaluation.summary}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-subtle)]">
          This score describes the current PostLens rubric. It does not predict
          reach, engagement, or virality.
        </p>

        <dl className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3">
            <dt className="text-xs font-medium text-[var(--text-subtle)]">
              Strongest
            </dt>
            <dd className="mt-1 font-semibold text-[var(--text-primary)]">
              {strongestLabel}
            </dd>
          </div>
          <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3">
            <dt className="text-xs font-medium text-[var(--text-subtle)]">
              Weakest
            </dt>
            <dd className="mt-1 font-semibold text-[var(--text-primary)]">
              {weakestLabel}
            </dd>
          </div>
        </dl>

        <div className="mt-7 rounded-lg border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-4">
          <p className="text-xs font-semibold text-[var(--accent-text)]">
            Focus next on {weakestLabel}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
            {weakest.explanation}
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-5 py-2 sm:px-7 lg:px-8">
        <h2 className="sr-only">Dimension scores</h2>
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {EVALUATION_DIMENSIONS.map((dimension) => (
            <DimensionResult
              key={dimension}
              dimension={dimension}
              evaluation={evaluation.dimensions[dimension]}
              emphasis={
                dimension === evaluation.strongestDimension
                  ? "strongest"
                  : dimension === evaluation.weakestDimension
                    ? "weakest"
                    : undefined
              }
            />
          ))}
        </ol>
      </div>
    </section>
  );
}
