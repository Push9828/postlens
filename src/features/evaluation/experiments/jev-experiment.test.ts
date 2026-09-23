import { describe, expect, it } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  type PostEvaluation,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import type { JevEvaluationDiagnostics } from "../infrastructure/jev/jev.types";
import {
  type JevExperimentRun,
  summarizeJevBatchingExperiment,
  summarizeJevExperiment,
} from "./jev-experiment";

function createEvaluation(level: EvaluationLevel): PostEvaluation {
  return scorePost({
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level, explanation: "fixture" },
      ]),
    ) as Parameters<typeof scorePost>[0]["dimensions"],
    contentType: "educational",
    summary: "fixture",
  });
}

function createDiagnostics(latencyMs: number): JevEvaluationDiagnostics {
  return {
    provider: "jev",
    requestedModel: "jev-test",
    resolvedModel: "jev-test",
    rubric: { id: "postlens-linkedin", version: "1.0.0" },
    explanationMode: "rubric-level",
    latencyMs,
    usage: { inputTokens: 10, outputTokens: 5 },
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        {
          selectedLevel: 2,
          expectedScore: 2,
          confidence: 0.8,
          probabilities: { 0: 0, 1: 0, 2: 1, 3: 0, 4: 0 },
        },
      ]),
    ) as JevEvaluationDiagnostics["dimensions"],
    contentType: "educational",
    contentTypeConfidence: 0.9,
  };
}

function successRun(
  repetition: number,
  level: EvaluationLevel,
  latencyMs: number,
): JevExperimentRun {
  return {
    status: "success",
    fixtureId: "fixture",
    category: "educational",
    repetition,
    explanationMode: "rubric-level",
    recordedAt: "2026-09-23T00:00:00.000Z",
    evaluation: createEvaluation(level),
    diagnostics: createDiagnostics(latencyMs),
  };
}

describe("summarizeJevExperiment", () => {
  it("calculates latency, failures, and pairwise repeatability", () => {
    const summary = summarizeJevExperiment([
      successRun(1, 2, 100),
      successRun(2, 2, 200),
      successRun(3, 4, 300),
      {
        status: "failure",
        fixtureId: "fixture",
        category: "educational",
        repetition: 4,
        explanationMode: "rubric-level",
        recordedAt: "2026-09-23T00:00:00.000Z",
        errorKind: "timeout",
      },
    ]);

    expect(summary).toMatchObject({
      totalRuns: 4,
      successfulRuns: 3,
      failedRuns: 1,
      successRate: 0.75,
      latencyMs: { p50: 200, p95: 300 },
      repeatability: {
        comparisonCount: 24,
        exactAgreementRate: 1 / 3,
        withinOneLevelRate: 1 / 3,
        largeDifferenceRate: 2 / 3,
      },
      failuresByKind: { timeout: 1 },
    });
  });

  it("returns null metrics when there are no comparable successes", () => {
    const summary = summarizeJevExperiment([]);

    expect(summary.latencyMs).toEqual({ p50: null, p95: null });
    expect(summary.repeatability).toEqual({
      comparisonCount: 0,
      exactAgreementRate: null,
      withinOneLevelRate: null,
      largeDifferenceRate: null,
    });
  });
});

describe("summarizeJevBatchingExperiment", () => {
  it("compares latency and token usage by request mode", () => {
    const summary = summarizeJevBatchingExperiment([
      {
        mode: "batched",
        latencyMs: 100,
        inputTokens: 100,
        outputTokens: 20,
      },
      {
        mode: "batched",
        latencyMs: 200,
        inputTokens: 200,
        outputTokens: 40,
      },
      {
        mode: "parallel-separate",
        latencyMs: 300,
        inputTokens: 900,
        outputTokens: 80,
      },
    ]);

    expect(summary).toEqual({
      batched: {
        measurementCount: 2,
        latencyMs: { p50: 100, p95: 200 },
        averageInputTokens: 150,
        averageOutputTokens: 30,
      },
      "parallel-separate": {
        measurementCount: 1,
        latencyMs: { p50: 300, p95: 300 },
        averageInputTokens: 900,
        averageOutputTokens: 80,
      },
    });
  });
});
