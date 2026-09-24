"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../application/evaluate-post.limits";
import {
  analyzerReducer,
  INITIAL_ANALYZER_STATE,
  isResultStale,
} from "./analyzer-state";
import { DraftEditor } from "./draft-editor";
import {
  EvaluationClientError,
  requestPostEvaluation,
} from "./evaluation-api-client";
import { EvaluationErrorPanel } from "./evaluation-error-panel";
import { EvaluationLoading } from "./evaluation-loading";
import { EvaluationResults } from "./evaluation-results";

const FIELD_ERROR_CODES = new Set([
  "INVALID_REQUEST",
  "POST_TOO_SHORT",
  "POST_TOO_LONG",
]);

interface AnalyzerProps {
  readonly content: string;
  readonly onContentChange: (content: string) => void;
}

export function Analyzer({ content, onContentChange }: AnalyzerProps) {
  const [showEmptyError, setShowEmptyError] = useState(false);
  const [state, dispatch] = useReducer(analyzerReducer, INITIAL_ANALYZER_STATE);
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);

  const normalizedContent = content.trim();
  const characterCount = countUnicodeCodePoints(normalizedContent);
  const isSubmitting = state.status === "submitting";
  const clientValidation = getValidationMessage(characterCount, showEmptyError);
  const serverFieldError =
    state.status === "failure" &&
    state.submittedContent === normalizedContent &&
    state.error.code !== undefined &&
    FIELD_ERROR_CODES.has(state.error.code)
      ? state.error.message
      : undefined;
  const validationMessage = serverFieldError ?? clientValidation;
  const canSubmit =
    characterCount >= MIN_POST_CHARACTERS &&
    characterCount <= MAX_POST_CHARACTERS &&
    !isSubmitting;

  useEffect(() => {
    return () => activeController.current?.abort();
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      resultHeadingRef.current?.focus({ preventScroll: false });
      return;
    }

    if (state.status === "failure") {
      if (
        state.error.code !== undefined &&
        FIELD_ERROR_CODES.has(state.error.code)
      ) {
        textareaRef.current?.focus();
      } else {
        errorHeadingRef.current?.focus({ preventScroll: false });
      }
    }
  }, [state]);

  const submit = async () => {
    if (!canSubmit) {
      setShowEmptyError(true);
      textareaRef.current?.focus();
      return;
    }

    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    requestSequence.current += 1;
    const requestId = requestSequence.current;
    const submittedContent = normalizedContent;

    dispatch({ type: "submit", requestId, submittedContent });

    try {
      const result = await requestPostEvaluation(submittedContent, {
        signal: controller.signal,
      });
      dispatch({ type: "succeed", requestId, result });
    } catch (error) {
      const safeError =
        error instanceof EvaluationClientError
          ? error
          : new EvaluationClientError(
              "invalid-response",
              "The analysis could not be completed. Please try again.",
              true,
            );

      if (safeError.kind !== "aborted") {
        dispatch({ type: "fail", requestId, error: safeError });
      }
    }
  };

  const handleContentChange = (nextContent: string) => {
    onContentChange(nextContent);
    setShowEmptyError(false);
  };

  const liveMessage = getLiveMessage(state.status);
  const isStale = isResultStale(state, normalizedContent);
  const showResultError =
    state.status === "failure" && serverFieldError === undefined;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-8">
      <div className="xl:sticky xl:top-6">
        <DraftEditor
          content={content}
          characterCount={characterCount}
          validationMessage={validationMessage}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          textareaRef={textareaRef}
          onChange={handleContentChange}
          onSubmit={submit}
          onInvalidSubmit={() => {
            setShowEmptyError(true);
            textareaRef.current?.focus();
          }}
        />
      </div>

      <div className="min-w-0" aria-live="off">
        {state.status === "idle" ? <AnalyzerIntroduction /> : null}
        {state.status === "submitting" ? <EvaluationLoading /> : null}
        {state.status === "success" ? (
          <EvaluationResults
            result={state.result}
            isStale={isStale}
            headingRef={resultHeadingRef}
          />
        ) : null}
        {showResultError && state.status === "failure" ? (
          <EvaluationErrorPanel
            error={state.error}
            canRetry={canSubmit}
            headingRef={errorHeadingRef}
            onRetry={submit}
          />
        ) : null}
        {state.status === "failure" && serverFieldError !== undefined ? (
          <AnalyzerIntroduction />
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
    </div>
  );
}

function AnalyzerIntroduction() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 sm:p-8 lg:p-10">
      <p className="text-sm font-semibold text-[var(--accent-text)]">
        A rubric, not a forecast
      </p>
      <h2 className="mt-3 max-w-lg text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
        See what is working and what needs another pass.
      </h2>
      <dl className="mt-8 space-y-0">
        <div className="border-b border-[var(--border)] py-5 first:pt-0">
          <dt className="font-semibold text-[var(--text-primary)]">
            One transparent score
          </dt>
          <dd className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Post Potential summarizes the same weighted rubric every time.
          </dd>
        </div>
        <div className="border-b border-[var(--border)] py-5">
          <dt className="font-semibold text-[var(--text-primary)]">
            Eight dimension explanations
          </dt>
          <dd className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Understand the judgment behind Hook, Clarity, Novelty, and more.
          </dd>
        </div>
        <div className="pt-5">
          <dt className="font-semibold text-[var(--text-primary)]">
            A clear next focus
          </dt>
          <dd className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Start with the weakest area without replacing your voice.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function getValidationMessage(
  characterCount: number,
  showEmptyError: boolean,
): string | undefined {
  if (characterCount === 0) {
    return showEmptyError ? "Paste a draft before analyzing it." : undefined;
  }

  if (characterCount < MIN_POST_CHARACTERS) {
    const remaining = MIN_POST_CHARACTERS - characterCount;
    return `Add ${remaining} more ${remaining === 1 ? "character" : "characters"}.`;
  }

  if (characterCount > MAX_POST_CHARACTERS) {
    const excess = characterCount - MAX_POST_CHARACTERS;
    return `Remove ${excess.toLocaleString()} ${excess === 1 ? "character" : "characters"}.`;
  }

  return undefined;
}

function getLiveMessage(status: "idle" | "submitting" | "success" | "failure") {
  switch (status) {
    case "submitting":
      return "Analyzing your draft.";
    case "success":
      return "Analysis complete. Results are ready.";
    case "failure":
      return "The analysis could not be completed.";
    default:
      return "";
  }
}
