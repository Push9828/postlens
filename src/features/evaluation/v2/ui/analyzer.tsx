"use client";

import { useEffect, useRef, useState } from "react";
import { V2ImprovementPanel } from "../../../improvement/v2/ui/improvement-panel";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../../application/evaluate-post.limits";
import { DraftEditor } from "../../ui/draft-editor";
import { EvaluationLoading } from "../../ui/evaluation-loading";
import { SAMPLE_DRAFTS } from "../../ui/sample-drafts";
import type { V2EvaluatePostResult } from "../evaluate-post";
import { withPostTypeOverride } from "../resolve-evaluation";
import type { PostType } from "../types";
import {
  requestV2PostEvaluation,
  V2EvaluationClientError,
} from "./evaluation-api-client";
import { V2EvaluationResults } from "./evaluation-results";

type State =
  | { status: "idle" }
  | { status: "submitting"; submittedContent: string }
  | {
      status: "success";
      submittedContent: string;
      result: V2EvaluatePostResult;
    }
  | {
      status: "failure";
      submittedContent: string;
      error: V2EvaluationClientError;
    };

export function V2Analyzer({
  content,
  onContentChange,
  hasExistingVersionB,
  onCompareRevision,
}: {
  readonly content: string;
  readonly onContentChange: (content: string) => void;
  readonly hasExistingVersionB: boolean;
  readonly onCompareRevision: (original: string, revision: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [override, setOverride] = useState<PostType | undefined>();
  const [showEmptyError, setShowEmptyError] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.status === "success") resultHeadingRef.current?.focus();
    if (state.status === "failure") errorHeadingRef.current?.focus();
  }, [state]);
  const normalized = content.trim();
  const count = countUnicodeCodePoints(normalized);
  const isSubmitting = state.status === "submitting";
  const canSubmit =
    count >= MIN_POST_CHARACTERS &&
    count <= MAX_POST_CHARACTERS &&
    !isSubmitting;
  const stale =
    (state.status === "success" || state.status === "failure") &&
    state.submittedContent !== normalized;
  const validationMessage =
    count === 0
      ? showEmptyError
        ? "Paste a draft before analyzing it."
        : undefined
      : count < MIN_POST_CHARACTERS
        ? `Add ${MIN_POST_CHARACTERS - count} more characters.`
        : count > MAX_POST_CHARACTERS
          ? `Remove ${count - MAX_POST_CHARACTERS} characters.`
          : undefined;
  const submit = async () => {
    if (!canSubmit) {
      setShowEmptyError(true);
      textareaRef.current?.focus();
      return;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const requestId = ++sequence.current;
    const submittedContent = normalized;
    setOverride(undefined);
    setState({ status: "submitting", submittedContent });
    try {
      const result = await requestV2PostEvaluation(submittedContent, {
        signal: active.signal,
      });
      if (sequence.current === requestId)
        setState({ status: "success", submittedContent, result });
    } catch (error) {
      if (
        sequence.current !== requestId ||
        (error instanceof V2EvaluationClientError && error.kind === "aborted")
      )
        return;
      setState({
        status: "failure",
        submittedContent,
        error:
          error instanceof V2EvaluationClientError
            ? error
            : new V2EvaluationClientError(
                "invalid-response",
                "The analysis could not be completed. Try again.",
                true,
              ),
      });
    }
  };
  const result =
    state.status === "success"
      ? {
          ...state.result,
          evaluation: withPostTypeOverride(state.result.evaluation, override),
        }
      : undefined;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-8">
      <div className="xl:sticky xl:top-6">
        <DraftEditor
          content={content}
          characterCount={count}
          validationMessage={validationMessage}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          textareaRef={textareaRef}
          onChange={(next) => {
            onContentChange(next);
            setShowEmptyError(false);
          }}
          onSubmit={() => void submit()}
          onInvalidSubmit={() => {
            setShowEmptyError(true);
            textareaRef.current?.focus();
          }}
        />
        {content.trim() === "" ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Try a sample draft
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_DRAFTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    onContentChange(sample.content);
                    textareaRef.current?.focus();
                  }}
                  className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-strong)] px-3 text-sm text-[var(--text-primary)]"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        {state.status === "idle" ? (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              See what is working and what needs another pass.
            </h2>
            <p className="mt-4 text-[var(--text-muted)]">
              Nine clear dimensions. Content Quality and Engagement Potential
              stay separate, and you can correct the detected post type.
            </p>
          </section>
        ) : null}
        {state.status === "submitting" ? <EvaluationLoading /> : null}
        {state.status === "success" && result ? (
          <>
            <V2EvaluationResults
              evaluation={result.evaluation}
              isStale={stale}
              override={override}
              onOverride={setOverride}
              headingRef={resultHeadingRef}
            />
            <V2ImprovementPanel
              key={`${result.evaluationId}-${override ?? "detected"}`}
              content={content}
              submittedContent={state.submittedContent}
              evaluationResult={result}
              isStale={stale}
              onUse={(text) => {
                onContentChange(text);
                textareaRef.current?.focus();
              }}
              hasExistingVersionB={hasExistingVersionB}
              onCompareRevision={(revision) =>
                onCompareRevision(state.submittedContent, revision)
              }
            />
          </>
        ) : null}
        {state.status === "failure" ? (
          <section className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-surface)] p-6">
            <h2
              ref={errorHeadingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-[var(--text-primary)]"
            >
              Analysis unavailable
            </h2>
            <p className="mt-3 text-[var(--text-muted)]">
              {state.error.message}
            </p>
            {state.error.retryable ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="mt-4 min-h-11 cursor-pointer rounded-lg border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-primary)]"
              >
                Try again
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {isSubmitting
          ? "Analyzing your draft."
          : state.status === "success"
            ? "Analysis complete."
            : state.status === "failure"
              ? "Analysis unavailable."
              : ""}
      </p>
    </div>
  );
}
