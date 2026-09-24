import type {
  DimensionEvaluation,
  EvaluationDimension,
} from "../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../domain/rubric";
import { DIMENSION_LABELS } from "./score-copy";

interface DimensionResultProps {
  readonly dimension: EvaluationDimension;
  readonly evaluation: DimensionEvaluation;
  readonly emphasis?: "strongest" | "weakest";
}

export function DimensionResult({
  dimension,
  evaluation,
  emphasis,
}: DimensionResultProps) {
  const label = DIMENSION_LABELS[dimension];

  return (
    <li className="border-t border-[var(--border)] py-5 sm:py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {label}
          </h3>
          {emphasis === undefined ? null : (
            <p className="mt-1 text-xs font-semibold text-[var(--accent-text)]">
              {emphasis === "strongest"
                ? "Strongest dimension"
                : "Weakest dimension"}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <span className="sr-only">
            {label} score: {evaluation.score} out of 100
          </span>
          <p
            aria-hidden="true"
            className="font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]"
          >
            {evaluation.score}
            <span className="text-xs font-normal text-[var(--text-subtle)]">
              {" "}
              / 100
            </span>
          </p>
        </div>
      </div>
      <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
        {evaluation.explanation}
      </p>
      <details className="mt-3 text-sm text-[var(--text-muted)]">
        <summary className="w-fit cursor-pointer font-medium text-[var(--accent-text)]">
          How this is judged
        </summary>
        <p className="mt-2 max-w-[58ch] leading-6">
          {POSTLENS_RUBRIC.dimensions[dimension].question}
        </p>
        <p className="mt-1 max-w-[58ch] leading-6">
          Level {evaluation.level} of 4:{" "}
          {POSTLENS_RUBRIC.dimensions[dimension].levels[evaluation.level]}
        </p>
      </details>
    </li>
  );
}
