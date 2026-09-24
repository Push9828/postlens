"use client";

import { useEffect, useRef, useState } from "react";
import type { V2EvaluatePostResult } from "../../../evaluation/v2/evaluate-post";
import { EVALUATION_DIMENSIONS } from "../../../evaluation/v2/types";
import { V2_DIMENSION_LABELS } from "../../../evaluation/v2/ui/score-copy";
import type { V2ImprovementResult } from "../improve-post";
import {
  requestV2Improvement,
  V2ImprovementClientError,
} from "./improvement-api-client";

export function V2ImprovementPanel({
  content,
  submittedContent,
  evaluationResult,
  isStale,
  onUse,
  onCompareRevision,
  hasExistingVersionB,
}: {
  readonly content: string;
  readonly submittedContent: string;
  readonly evaluationResult: V2EvaluatePostResult;
  readonly isStale: boolean;
  readonly onUse: (text: string) => void;
  readonly onCompareRevision: (text: string) => void;
  readonly hasExistingVersionB: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<V2ImprovementResult | null>(null);
  const [error, setError] = useState<V2ImprovementClientError | null>(null);
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    if (isStale || running) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const id = ++sequence.current;
    setRunning(true);
    setResult(null);
    setError(null);
    setMessage("");
    try {
      const next = await requestV2Improvement(
        submittedContent,
        evaluationResult,
        { signal: active.signal },
      );
      if (sequence.current === id) setResult(next);
    } catch (failure) {
      if (
        sequence.current === id &&
        !(
          failure instanceof V2ImprovementClientError &&
          failure.kind === "aborted"
        )
      )
        setError(
          failure instanceof V2ImprovementClientError
            ? failure
            : new V2ImprovementClientError(
                "invalid-response",
                "Could not improve the post. Try again.",
                true,
              ),
        );
    } finally {
      if (sequence.current === id) setRunning(false);
    }
  };
  const suggestionStale = content.trim() !== submittedContent || isStale;
  return (
    <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] sm:p-7">
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
        Improve your post
      </h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Get a revised draft guided by all nine dimensions. We check it against
        the original draft under its selected profile.
      </p>
      {isStale ? (
        <p className="mt-3 text-sm text-[var(--warning-text)]">
          Analyze the current draft before requesting another improvement.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void generate()}
        disabled={isStale || running}
        className="mt-5 min-h-11 cursor-pointer rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {running ? "Improving post..." : "Improve post"}
      </button>
      {running ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Revising and checking both scores.
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error)]"
        >
          <p>{error.message}</p>
          {error.retryable ? (
            <button
              type="button"
              onClick={() => void generate()}
              className="mt-2 cursor-pointer font-semibold underline"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {result?.status === "no-safe-change" ? (
        <div className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-4 text-sm">
          <p className="font-semibold text-[var(--warning-text)]">
            No verified improvement found
          </p>
          <p className="mt-1 text-[var(--text-muted)]">{result.reason}</p>
        </div>
      ) : null}
      {result?.status === "suggested" ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <h3 className="font-semibold text-[var(--text-primary)]">
            Suggested draft
          </h3>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {result.changeNote}
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
            Content Quality {Math.round(result.verification.originalQuality)} →{" "}
            {Math.round(result.verification.revisedQuality)} · Engagement
            Potential {Math.round(result.verification.originalEngagement)} →{" "}
            {Math.round(result.verification.revisedEngagement)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Scores can vary on a later analysis. The check used the original
            draft’s profile.
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {EVALUATION_DIMENSIONS.filter(
              (dimension) =>
                result.verification.dimensionDeltas[dimension] !== 0,
            )
              .map(
                (dimension) =>
                  `${V2_DIMENSION_LABELS[dimension]} ${result.verification.dimensionDeltas[dimension] > 0 ? "+" : ""}${result.verification.dimensionDeltas[dimension]}`,
              )
              .join(" · ")}
          </p>
          {suggestionStale ? (
            <p className="mt-2 text-sm text-[var(--warning-text)]">
              This suggestion belongs to a previously analyzed draft.
            </p>
          ) : null}
          <p className="mt-2 text-sm text-[var(--warning-text)]">
            Review facts and voice before posting.
          </p>
          <textarea
            readOnly
            value={result.revisedText}
            aria-label="Suggested draft"
            className="mt-4 min-h-64 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--input)] p-3 text-sm text-[var(--text-primary)]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(result.revisedText)
                  .then(() => setMessage("Copied suggestion."))
                  .catch(() => setMessage("Could not copy suggestion."))
              }
              className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-primary)]"
            >
              Copy suggestion
            </button>
            <button
              type="button"
              onClick={() => onUse(result.revisedText)}
              className="min-h-11 cursor-pointer rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Use in editor
            </button>
            <button
              type="button"
              disabled={suggestionStale}
              onClick={() => onCompareRevision(result.revisedText)}
              className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed"
            >
              {hasExistingVersionB
                ? "Replace Version B and compare"
                : "Compare with original"}
            </button>
          </div>
          {message ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
