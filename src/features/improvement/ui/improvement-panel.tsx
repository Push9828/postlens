"use client";

import { useEffect, useRef, useState } from "react";
import type { EvaluatePostResult } from "../../evaluation/application/evaluate-post";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import { DIMENSION_LABELS } from "../../evaluation/ui/score-copy";
import type { ImprovementResult } from "../application/improve-post";
import {
  ImprovementClientError,
  requestImprovement,
} from "./improvement-api-client";

interface Props {
  readonly content: string;
  readonly submittedContent: string;
  readonly evaluationResult: EvaluatePostResult;
  readonly isStale: boolean;
  readonly onUse: (text: string) => void;
  readonly hasExistingVersionB: boolean;
  readonly onCompareRevision: (text: string) => void;
}

export function ImprovementPanel({
  content,
  submittedContent,
  evaluationResult,
  isStale,
  onUse,
  hasExistingVersionB,
  onCompareRevision,
}: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [error, setError] = useState<ImprovementClientError | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const requestedContent = useRef<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const generate = async () => {
    if (isStale || running) return;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    sequence.current += 1;
    const requestId = sequence.current;
    requestedContent.current = submittedContent;
    setRunning(true);
    setResult(null);
    setError(null);
    setCopyMessage("");
    try {
      const response = await requestImprovement(
        submittedContent,
        "whole-post",
        evaluationResult,
        { signal: nextController.signal },
      );
      if (sequence.current === requestId) setResult(response);
    } catch (failure) {
      if (sequence.current === requestId) {
        const safeError =
          failure instanceof ImprovementClientError
            ? failure
            : new ImprovementClientError(
                "invalid-response",
                "The improvement could not be completed. Please try again.",
                true,
              );
        if (safeError.kind !== "aborted") setError(safeError);
      }
    } finally {
      if (sequence.current === requestId) setRunning(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Suggestion copied.");
    } catch {
      setCopyMessage(
        "Copy failed. Select the suggested text and copy it manually.",
      );
    }
  };

  const suggestionStale =
    isStale ||
    (requestedContent.current !== null &&
      content.trim() !== requestedContent.current);

  return (
    <section
      className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] sm:p-7"
      aria-labelledby="improvement-heading"
    >
      <h2
        id="improvement-heading"
        className="text-xl font-semibold text-[var(--text-primary)]"
      >
        Improve your post
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
        Get a revised draft using all eight rubric dimensions. We check it
        against the original and show the score and dimension changes.
      </p>
      {isStale ? (
        <p className="mt-3 text-sm text-[var(--warning-text)]">
          Analyze the current draft before requesting another improvement.
        </p>
      ) : null}
      <div className="mt-5">
        <button
          type="button"
          disabled={isStale || running}
          onClick={generate}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {running ? "Improving post..." : "Improve post"}
        </button>
      </div>
      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {running ? (
          <p className="text-sm text-[var(--text-muted)]">
            Revising the post and checking it against the rubric.
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error)]"
          >
            <p>{error.message}</p>
            {error.retryable && !isStale ? (
              <button
                type="button"
                onClick={generate}
                className="mt-3 font-semibold underline"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {result?.status === "no-safe-change" ? (
          <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-surface)] p-4 text-sm">
            <p className="font-semibold text-[var(--warning-text)]">
              No verified improvement found
            </p>
            <p className="mt-1 text-[var(--text-muted)]">{result.reason}</p>
          </div>
        ) : null}
        {result?.status === "suggested" ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Suggested draft
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Focus: improving the post as a whole
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {result.changeNote}
            </p>
            {result.verification ? (
              <div className="mt-2 text-sm text-[var(--text-primary)]">
                <p className="font-medium">
                  Rubric check: {result.verification.originalScore} →{" "}
                  {result.verification.revisedScore} Post Potential (+
                  {result.verification.overallDelta}).
                </p>
                <p className="mt-1 text-[var(--text-muted)]">
                  {EVALUATION_DIMENSIONS.filter(
                    (dimension) =>
                      result.verification?.dimensionDeltas[dimension] !== 0,
                  )
                    .map((dimension) => {
                      const delta =
                        result.verification?.dimensionDeltas[dimension] ?? 0;
                      return `${DIMENSION_LABELS[dimension]} ${delta > 0 ? "+" : ""}${delta}`;
                    })
                    .join(" · ")}
                </p>
                <p className="mt-1 text-[var(--text-muted)]">
                  Scores can vary on a later analysis.
                </p>
              </div>
            ) : null}
            {suggestionStale ? (
              <p className="mt-2 text-sm font-medium text-[var(--warning-text)]">
                This suggestion belongs to the previously analyzed draft.
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium text-[var(--warning-text)]">
              Review facts and voice before posting.
            </p>
            <textarea
              readOnly
              value={result.revisedText}
              aria-label="Suggested draft"
              className="mt-4 min-h-64 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--input)] p-3 text-sm leading-6 text-[var(--text-primary)]"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => copy(result.revisedText)}
                className="min-h-11 rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                Copy suggestion
              </button>
              <button
                type="button"
                onClick={() => onUse(result.revisedText)}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)]"
              >
                Use in editor
              </button>
              <button
                type="button"
                disabled={suggestionStale}
                onClick={() => onCompareRevision(result.revisedText)}
                className="min-h-11 rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {hasExistingVersionB
                  ? "Replace Version B and compare"
                  : "Compare with original"}
              </button>
            </div>
            {hasExistingVersionB ? (
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                This replaces the current Version B draft. Comparison starts
                only when you submit both drafts.
              </p>
            ) : null}
            {copyMessage ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {copyMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
