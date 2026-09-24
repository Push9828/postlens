"use client";

import { useEffect, useRef, useState } from "react";
import type { EvaluatePostResult } from "../../evaluation/application/evaluate-post";
import { DIMENSION_LABELS } from "../../evaluation/ui/score-copy";
import type { ImprovementResult } from "../application/improve-post";
import type { ImprovementAction } from "../domain/improvement";
import {
  ImprovementClientError,
  requestImprovement,
} from "./improvement-api-client";

const ACTION_LABELS: readonly [ImprovementAction, string][] = [
  ["whole-post", "Improve this post"],
  ["hook", "Improve the hook"],
  ["ending", "Improve the ending"],
  ["weakest-areas", "Improve the weakest areas"],
];

interface Props {
  readonly content: string;
  readonly submittedContent: string;
  readonly evaluationResult: EvaluatePostResult;
  readonly isStale: boolean;
  readonly onUse: (text: string) => void;
}

export function ImprovementPanel({
  content,
  submittedContent,
  evaluationResult,
  isStale,
  onUse,
}: Props) {
  const [runningAction, setRunningAction] = useState<ImprovementAction | null>(
    null,
  );
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [error, setError] = useState<ImprovementClientError | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const actionRef = useRef<ImprovementAction | null>(null);
  const requestedContent = useRef<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const generate = async (action: ImprovementAction) => {
    if (isStale) return;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    sequence.current += 1;
    const requestId = sequence.current;
    actionRef.current = action;
    requestedContent.current = submittedContent;
    setRunningAction(action);
    setResult(null);
    setError(null);
    setCopyMessage("");
    try {
      const response = await requestImprovement(
        submittedContent,
        action,
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
      if (sequence.current === requestId) setRunningAction(null);
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
        Targeted improvement
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
        Choose a focus after reviewing the rubric result. Suggestions keep the
        original score unchanged.
      </p>
      {isStale ? (
        <p className="mt-3 text-sm text-[var(--warning-text)]">
          Analyze the current draft before requesting another improvement.
        </p>
      ) : null}
      {submittedContent.split(/\r?\n\s*\r?\n/).filter(Boolean).length === 1 ? (
        <p className="mt-2 text-xs text-[var(--text-subtle)]">
          This draft has one paragraph, so a hook or ending edit may change the
          whole draft.
        </p>
      ) : null}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {ACTION_LABELS.map(([action, label]) => (
          <button
            key={action}
            type="button"
            disabled={isStale}
            onClick={() => generate(action)}
            className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--input)] px-4 py-2 text-left text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {runningAction === action
              ? `Improving ${action === "whole-post" ? "post" : action === "weakest-areas" ? "weakest areas" : action}...`
              : label}
          </button>
        ))}
      </div>
      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {runningAction ? (
          <p className="text-sm text-[var(--text-muted)]">
            Generating a suggestion for{" "}
            {ACTION_LABELS.find(
              ([action]) => action === runningAction,
            )?.[1].toLowerCase()}
            .
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-[var(--error-border)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error)]"
          >
            <p>{error.message}</p>
            {error.retryable && !isStale && actionRef.current ? (
              <button
                type="button"
                onClick={() => generate(actionRef.current as ImprovementAction)}
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
              No safe change found
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
              {ACTION_LABELS.find(([action]) => action === result.action)?.[1]}
              {result.focusDimensions.length
                ? ` · Focus: ${result.focusDimensions.map((dimension) => DIMENSION_LABELS[dimension]).join(", ")}`
                : ""}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {result.changeNote}
            </p>
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
            </div>
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
