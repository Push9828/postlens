"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../../application/evaluate-post.limits";
import { BattleEditor } from "../../ui/battle-editor";
import type { V2ComparePostsResult, V2ComparisonSide } from "../compare-posts";
import { EVALUATION_DIMENSIONS } from "../types";
import {
  requestV2Comparison,
  V2ComparisonClientError,
} from "./comparison-api-client";
import { V2_DIMENSION_LABELS, V2_TYPE_LABELS } from "./score-copy";

type State =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "result"; A: string; B: string; result: V2ComparePostsResult }
  | { status: "error"; error: V2ComparisonClientError };

export function V2PostBattle({
  versionA,
  versionB,
  onVersionAChange,
  onVersionBChange,
}: {
  readonly versionA: string;
  readonly versionB: string;
  readonly onVersionAChange: (content: string) => void;
  readonly onVersionBChange: (content: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [showErrors, setShowErrors] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const aRef = useRef<HTMLTextAreaElement>(null);
  const bRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.status === "result" || state.status === "error")
      headingRef.current?.focus();
  }, [state]);
  const A = versionA.trim();
  const B = versionB.trim();
  const countA = countUnicodeCodePoints(A);
  const countB = countUnicodeCodePoints(B);
  const valid = (count: number) =>
    count >= MIN_POST_CHARACTERS && count <= MAX_POST_CHARACTERS;
  const canSubmit =
    valid(countA) && valid(countB) && state.status !== "submitting";
  const message = (count: number) =>
    count === 0
      ? showErrors
        ? "Paste a draft before comparing it."
        : undefined
      : count < MIN_POST_CHARACTERS
        ? `Add ${MIN_POST_CHARACTERS - count} more characters.`
        : count > MAX_POST_CHARACTERS
          ? `Remove ${count - MAX_POST_CHARACTERS} characters.`
          : undefined;
  const submit = async () => {
    if (!canSubmit) {
      setShowErrors(true);
      (valid(countA) ? bRef : aRef).current?.focus();
      return;
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const id = ++sequence.current;
    setState({ status: "submitting" });
    try {
      const result = await requestV2Comparison(A, B, { signal: active.signal });
      if (sequence.current === id) setState({ status: "result", A, B, result });
    } catch (error) {
      if (
        sequence.current !== id ||
        (error instanceof V2ComparisonClientError && error.kind === "aborted")
      )
        return;
      setState({
        status: "error",
        error:
          error instanceof V2ComparisonClientError
            ? error
            : new V2ComparisonClientError(
                "invalid-response",
                "Comparison unavailable. Try again.",
                true,
              ),
      });
    }
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };
  const stale = state.status === "result" && (state.A !== A || state.B !== B);
  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={state.status === "submitting"}
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--panel-shadow)] sm:p-6"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <BattleEditor
            label="Version A"
            id="battle-a"
            content={versionA}
            count={countA}
            error={message(countA)}
            textareaRef={aRef}
            onChange={(value) => {
              onVersionAChange(value);
              setShowErrors(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <BattleEditor
            label="Version B"
            id="battle-b"
            content={versionB}
            count={countB}
            error={message(countB)}
            textareaRef={bRef}
            onChange={(value) => {
              onVersionBChange(value);
              setShowErrors(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
          <p className="text-xs text-[var(--text-subtle)]">
            Drafts are evaluated on request and are not saved.
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-11 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed"
          >
            {state.status === "submitting" ? "Comparing..." : "Compare drafts"}
          </button>
        </div>
      </form>
      {state.status === "idle" ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Compare under one profile
          </h2>
          <p className="mt-2 text-[var(--text-muted)]">
            See each draft’s own scores, then compare Content Quality under
            Version A’s profile.
          </p>
        </section>
      ) : null}
      {state.status === "submitting" ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-muted)]">
          Evaluating both drafts...
        </section>
      ) : null}
      {state.status === "error" ? (
        <section className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-surface)] p-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold text-[var(--text-primary)]"
          >
            Comparison unavailable
          </h2>
          <p className="mt-2 text-[var(--text-muted)]">{state.error.message}</p>
          {state.error.retryable ? (
            <button
              type="button"
              onClick={() => void submit()}
              className="mt-3 cursor-pointer font-semibold underline"
            >
              Try again
            </button>
          ) : null}
        </section>
      ) : null}
      {state.status === "result" ? (
        <BattleResult
          result={state.result}
          stale={stale}
          headingRef={headingRef}
          onRetry={() => void submit()}
        />
      ) : null}
    </div>
  );
}

function BattleResult({
  result,
  stale,
  headingRef,
  onRetry,
}: {
  result: V2ComparePostsResult;
  stale: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRetry: () => void;
}) {
  const { A, B } = result.versions;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-shadow)] sm:p-7">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold text-[var(--text-primary)]"
      >
        {result.status === "complete" ? "Post Battle" : "Comparison incomplete"}
      </h2>
      {stale ? (
        <p className="mt-3 rounded-lg bg-[var(--warning-surface)] p-3 text-sm text-[var(--warning-text)]">
          A draft changed since this result. Compare again to refresh it.
        </p>
      ) : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Side label="Version A" side={A} />
        <Side label="Version B" side={B} />
      </div>
      {result.status === "complete" ? (
        <>
          <div className="mt-5 rounded-xl bg-[var(--accent-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--accent-text)]">
              Content Quality under Version A’s profile
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[var(--text-primary)]">
              A {result.comparison.originalQuality.toFixed(1)} · B{" "}
              {result.comparison.revisedQuality.toFixed(1)}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {result.comparison.winner === "tie"
                ? "Both drafts tie under this profile."
                : `Version ${result.comparison.winner} scores higher under this profile.`}
            </p>
          </div>
          <h3 className="mt-6 font-semibold text-[var(--text-primary)]">
            Raw dimensions
          </h3>
          <div className="mt-2 space-y-1">
            {EVALUATION_DIMENSIONS.map((dimension) => (
              <div
                key={dimension}
                className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] border-t border-[var(--border)] py-2 text-sm text-[var(--text-muted)]"
              >
                <span>{V2_DIMENSION_LABELS[dimension]}</span>
                <span className="text-right font-mono">
                  {result.versions.A.evaluation.dimensionScores[dimension]}
                </span>
                <span className="text-right font-mono">
                  {result.versions.B.evaluation.dimensionScores[dimension]}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 cursor-pointer font-semibold text-[var(--accent-text)] underline"
        >
          Try again
        </button>
      )}
      <p className="mt-5 text-xs text-[var(--text-subtle)]">
        Rubric {result.rubricVersion}. These scores evaluate content, not
        impressions, reach, or virality.
      </p>
    </section>
  );
}

function Side({ label, side }: { label: string; side: V2ComparisonSide }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <p className="font-semibold text-[var(--text-primary)]">{label}</p>
      {side.status === "failure" ? (
        <p className="mt-2 text-sm text-[var(--error)]">{side.error.message}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            {V2_TYPE_LABELS[side.evaluation.detectedClassification.primaryType]}
          </p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Content Quality{" "}
            <strong className="font-mono text-[var(--text-primary)]">
              {Math.round(side.evaluation.scores.contentQuality)}
            </strong>
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Engagement Potential{" "}
            <strong className="font-mono text-[var(--text-primary)]">
              {Math.round(side.evaluation.scores.engagementPotential)}
            </strong>
          </p>
        </>
      )}
    </div>
  );
}
