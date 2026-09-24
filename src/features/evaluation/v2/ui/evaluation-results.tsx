import type { RefObject } from "react";
import { V2DownloadShareCard } from "../../../sharing/v2/download-share-card";
import type { V2PostEvaluation } from "../evaluate-post";
import { POSTLENS_RUBRIC_V2 } from "../rubric";
import { EVALUATION_DIMENSIONS, POST_TYPES, type PostType } from "../types";
import {
  qualityLabel,
  V2_DIMENSION_LABELS,
  V2_TYPE_LABELS,
} from "./score-copy";

export function V2EvaluationResults({
  evaluation,
  isStale,
  override,
  onOverride,
  headingRef,
}: {
  readonly evaluation: V2PostEvaluation;
  readonly isStale: boolean;
  readonly override?: PostType;
  readonly onOverride: (type?: PostType) => void;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const classification = evaluation.detectedClassification;
  const strongest = [...EVALUATION_DIMENSIONS].sort(
    (a, b) => evaluation.dimensionScores[b] - evaluation.dimensionScores[a],
  );
  const weakest = [...strongest].reverse();
  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--panel-shadow)]"
      aria-labelledby="evaluation-heading"
    >
      <div className="p-5 sm:p-7 lg:p-8">
        <p className="text-sm font-semibold text-[var(--accent-text)]">
          Rubric V2 · {evaluation.rubricVersion}
        </p>
        <h2
          ref={headingRef}
          id="evaluation-heading"
          tabIndex={-1}
          className="mt-2 text-2xl font-semibold text-[var(--text-primary)] outline-none"
        >
          Your draft evaluation
        </h2>
        {isStale ? (
          <p className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-3 text-sm text-[var(--warning-text)]">
            Draft changed since this analysis. Analyze again to refresh it.
          </p>
        ) : null}
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            Detected type
          </p>
          <p className="mt-1 font-semibold text-[var(--text-primary)]">
            {V2_TYPE_LABELS[classification.primaryType]}
          </p>
          {classification.secondaryType ? (
            <p className="text-sm text-[var(--text-muted)]">
              Secondary: {V2_TYPE_LABELS[classification.secondaryType]}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Confidence: {Math.round(classification.confidence * 100)}% ·{" "}
            {classification.reasoning}
          </p>
          <details className="mt-3 text-sm">
            <summary className="w-fit cursor-pointer font-semibold text-[var(--accent-text)]">
              Change type
            </summary>
            <label
              htmlFor="post-type-override"
              className="mt-3 block text-sm text-[var(--text-muted)]"
            >
              Score this draft as
            </label>
            <select
              id="post-type-override"
              value={override ?? "detected"}
              onChange={(event) =>
                onOverride(
                  event.target.value === "detected"
                    ? undefined
                    : (event.target.value as PostType),
                )
              }
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input)] px-3 text-[var(--text-primary)]"
            >
              <option value="detected">Use detected type</option>
              {POST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {V2_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </details>
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            {evaluation.resolvedProfile.source === "user-override"
              ? "Using your selected type."
              : evaluation.resolvedProfile.source === "ai-blended"
                ? "Using a 70/30 blend of the detected types."
                : evaluation.resolvedProfile.source === "generic-fallback"
                  ? "Using the generic profile because classification confidence is low."
                  : "Using the detected primary type."}
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ScoreCard
            label="Content Quality"
            score={evaluation.scores.contentQuality}
            description={qualityLabel(evaluation.scores.contentQuality)}
          />
          <ScoreCard
            label="Engagement Potential"
            score={evaluation.scores.engagementPotential}
            description="Natural reasons to read, react, or discuss"
          />
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--text-subtle)]">
          These scores evaluate the content itself. They do not predict
          impressions, reach, likes, comments, or virality.
        </p>
        <div className="mt-5">
          <V2DownloadShareCard evaluation={evaluation} disabled={isStale} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--surface-muted)] p-4">
            <p className="text-xs text-[var(--text-subtle)]">
              Strongest dimensions
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
              {strongest
                .slice(0, 3)
                .map(
                  (dimension) =>
                    `${V2_DIMENSION_LABELS[dimension]} ${evaluation.dimensionScores[dimension]}`,
                )
                .join(" · ")}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--surface-muted)] p-4">
            <p className="text-xs text-[var(--text-subtle)]">
              Biggest opportunities
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
              {weakest
                .slice(0, 2)
                .map(
                  (dimension) =>
                    `${V2_DIMENSION_LABELS[dimension]} ${evaluation.dimensionScores[dimension]}`,
                )
                .join(" · ")}
            </p>
          </div>
        </div>
      </div>
      <ol className="grid border-t border-[var(--border)] px-5 sm:grid-cols-2 sm:gap-x-8 sm:px-7 lg:px-8">
        {EVALUATION_DIMENSIONS.map((dimension) => {
          const judgment = evaluation.rawEvaluation.dimensions[dimension];
          const criterion = POSTLENS_RUBRIC_V2.dimensions[dimension];
          return (
            <li
              key={dimension}
              className="border-t border-[var(--border)] py-5 first:border-t-0 sm:first:border-t"
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {criterion.label}
                </h3>
                <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                  {evaluation.dimensionScores[dimension]} / 100
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {judgment.explanation}
              </p>
              <details className="mt-2 text-sm text-[var(--text-subtle)]">
                <summary className="w-fit cursor-pointer text-[var(--accent-text)]">
                  How this is judged
                </summary>
                <p className="mt-2">{criterion.question}</p>
                <p className="mt-1">→ {criterion.levels[judgment.level]}</p>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ScoreCard({
  label,
  score,
  description,
}: {
  label: string;
  score: number;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <p className="text-sm font-semibold text-[var(--accent-text)]">{label}</p>
      <p className="mt-2 font-mono text-5xl font-semibold tabular-nums text-[var(--text-primary)]">
        {Math.round(score)}
        <span className="ml-2 text-sm font-normal text-[var(--text-subtle)]">
          / 100
        </span>
      </p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
