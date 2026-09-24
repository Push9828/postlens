"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComparePostsResult } from "../application/compare-posts";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../application/evaluate-post.limits";
import { BattleEditor } from "./battle-editor";
import {
  ComparisonClientError,
  requestPostComparison,
} from "./comparison-api-client";
import { BattleResult, RetryButton } from "./post-battle-results";

type BattleState =
  | { readonly status: "idle" }
  | {
      readonly status: "submitting";
      readonly requestId: number;
      readonly A: string;
      readonly B: string;
    }
  | {
      readonly status: "result";
      readonly requestId: number;
      readonly A: string;
      readonly B: string;
      readonly result: ComparePostsResult;
    }
  | {
      readonly status: "error";
      readonly requestId: number;
      readonly A: string;
      readonly B: string;
      readonly error: ComparisonClientError;
    };

interface PostBattleProps {
  readonly versionA: string;
  readonly versionB: string;
  readonly onVersionAChange: (content: string) => void;
  readonly onVersionBChange: (content: string) => void;
}

export function PostBattle({
  versionA,
  versionB,
  onVersionAChange,
  onVersionBChange,
}: PostBattleProps) {
  const [state, setState] = useState<BattleState>({ status: "idle" });
  const [showEmptyErrors, setShowEmptyErrors] = useState(false);
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const aRef = useRef<HTMLTextAreaElement>(null);
  const bRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);

  const A = versionA.trim();
  const B = versionB.trim();
  const countA = countUnicodeCodePoints(A);
  const countB = countUnicodeCodePoints(B);
  const isSubmitting = state.status === "submitting";
  const canSubmit = validLength(countA) && validLength(countB) && !isSubmitting;
  const serverField =
    state.status === "error" && state.A === A && state.B === B
      ? state.error.field
      : undefined;
  const errorA =
    serverField === "A" && state.status === "error"
      ? state.error.message
      : lengthMessage(countA, showEmptyErrors);
  const errorB =
    serverField === "B" && state.status === "error"
      ? state.error.message
      : lengthMessage(countB, showEmptyErrors);
  const isStale =
    (state.status === "result" || state.status === "error") &&
    (state.A !== A || state.B !== B);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (state.status === "result")
      resultHeadingRef.current?.focus({ preventScroll: false });
    if (state.status === "error") {
      if (state.error.field === "A") aRef.current?.focus();
      else if (state.error.field === "B") bRef.current?.focus();
      else errorHeadingRef.current?.focus({ preventScroll: false });
    }
  }, [state]);

  const submit = async () => {
    if (!canSubmit) {
      setShowEmptyErrors(true);
      (validLength(countA) ? bRef : aRef).current?.focus();
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestSequence.current;
    setState({ status: "submitting", requestId, A, B });

    try {
      const result = await requestPostComparison(A, B, {
        signal: controller.signal,
      });
      setState((current) =>
        current.status === "submitting" && current.requestId === requestId
          ? { status: "result", requestId, A, B, result }
          : current,
      );
    } catch (error) {
      const safeError =
        error instanceof ComparisonClientError
          ? error
          : new ComparisonClientError(
              "invalid-response",
              "The comparison could not be completed. Please try again.",
              true,
            );
      if (safeError.kind !== "aborted") {
        setState((current) =>
          current.status === "submitting" && current.requestId === requestId
            ? { status: "error", requestId, A, B, error: safeError }
            : current,
        );
      }
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };
  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  const liveMessage = isSubmitting
    ? "Evaluating both drafts."
    : state.status === "result"
      ? state.result.status === "complete"
        ? "Comparison complete."
        : "Comparison incomplete."
      : state.status === "error"
        ? "Comparison unavailable."
        : "";

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        aria-busy={isSubmitting}
        noValidate
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--panel-shadow)] sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <BattleEditor
            label="Version A"
            id="battle-a"
            content={versionA}
            count={countA}
            error={errorA}
            textareaRef={aRef}
            onChange={(value) => {
              onVersionAChange(value);
              setShowEmptyErrors(false);
            }}
            onKeyDown={onEditorKeyDown}
          />
          <BattleEditor
            label="Version B"
            id="battle-b"
            content={versionB}
            count={countB}
            error={errorB}
            textareaRef={bRef}
            onChange={(value) => {
              onVersionBChange(value);
              setShowEmptyErrors(false);
            }}
            onKeyDown={onEditorKeyDown}
          />
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--text-subtle)]">
            Both drafts are evaluated on request and are not saved.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--button-disabled)] disabled:text-[var(--button-disabled-text)]"
          >
            {isSubmitting ? "Comparing..." : "Compare drafts"}
          </button>
        </div>
      </form>

      {state.status === "idle" ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Compare against one rubric
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--text-muted)]">
            See both Post Potential scores and where the eight dimension
            judgments differ. A higher score describes this rubric, not future
            LinkedIn performance.
          </p>
        </section>
      ) : null}
      {isSubmitting ? (
        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
          aria-label="Comparing drafts"
        >
          <p className="text-sm font-semibold text-[var(--accent-text)]">
            Evaluating Version A and Version B
          </p>
          <div className="skeleton mt-5 h-12 w-2/3 rounded-lg" />
          <div className="skeleton mt-5 h-32 w-full rounded-lg" />
        </section>
      ) : null}
      {state.status === "result" ? (
        <BattleResult
          result={state.result}
          isStale={isStale}
          headingRef={resultHeadingRef}
          onRetry={() => void submit()}
          canRetry={canSubmit}
        />
      ) : null}
      {state.status === "error" && state.error.field === undefined ? (
        <section className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-surface)] p-6 sm:p-8">
          <h2
            ref={errorHeadingRef}
            tabIndex={-1}
            className="text-xl font-semibold text-[var(--text-primary)]"
          >
            Comparison unavailable
          </h2>
          <p className="mt-3 text-[var(--text-muted)]">{state.error.message}</p>
          {state.error.retryable ? (
            <RetryButton onRetry={() => void submit()} disabled={!canSubmit} />
          ) : null}
        </section>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
    </div>
  );
}

function validLength(count: number): boolean {
  return count >= MIN_POST_CHARACTERS && count <= MAX_POST_CHARACTERS;
}
function lengthMessage(count: number, showEmpty: boolean): string | undefined {
  if (count === 0)
    return showEmpty ? "Paste a draft before comparing it." : undefined;
  if (count < MIN_POST_CHARACTERS)
    return `Add ${MIN_POST_CHARACTERS - count} more characters.`;
  if (count > MAX_POST_CHARACTERS)
    return `Remove ${(count - MAX_POST_CHARACTERS).toLocaleString()} characters.`;
  return undefined;
}
