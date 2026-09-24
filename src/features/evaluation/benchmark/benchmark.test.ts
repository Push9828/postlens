import { describe, expect, it } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "../domain/evaluation.types";
import { BENCHMARK_FIXTURES } from "../fixtures/benchmark-dataset";
import { JEV_EVALUATION_FIXTURES } from "../fixtures/jev-fixtures";
import { parseSavedAttempts } from "./attempts";
import type { BenchmarkAttempt, HumanLabelFile } from "./benchmark.types";
import { createDatasetManifest } from "./dataset";
import { createHumanLabelSheet, parseHumanLabels } from "./labels";
import { percentile, summarizeBenchmark } from "./metrics";
import { createBenchmarkReport, renderBenchmarkMarkdown } from "./report";
import { createSchedule, remainingSchedule } from "./schedule";

const levels = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((dimension) => [dimension, 2]),
) as Record<EvaluationDimension, EvaluationLevel>;
const base = {
  key: "strong-educational:1:jev",
  fixtureId: "strong-educational",
  category: "educational",
  provider: "jev" as const,
  repetition: 1,
  order: 1,
  recordedAt: "2026-09-24T00:00:00.000Z",
  requestedModel: "jev-fixed",
  totalLatencyMs: 100,
  evaluatorLatencyMs: 90,
};
const success: BenchmarkAttempt = {
  ...base,
  status: "success",
  resolvedModel: "jev-fixed",
  inputTokens: 100,
  outputTokens: 20,
  levels,
  overallScore: 50,
  contentType: "educational",
};
const failure: BenchmarkAttempt = {
  ...base,
  key: "strong-educational:2:jev",
  repetition: 2,
  order: 2,
  status: "failure",
  errorKind: "invalid-response",
};

describe("benchmark foundation", () => {
  it("freezes 50 permitted drafts while preserving historical fixture text", () => {
    const manifest = createDatasetManifest();
    expect(manifest.fixtureCount).toBe(50);
    expect(manifest.labelFixtureIds).toHaveLength(24);
    expect(manifest.hash).toHaveLength(64);
    for (const original of JEV_EVALUATION_FIXTURES)
      expect(
        BENCHMARK_FIXTURES.find((fixture) => fixture.id === original.id)
          ?.content,
      ).toBe(original.content);
    expect(() =>
      createDatasetManifest(
        [...BENCHMARK_FIXTURES.slice(1), BENCHMARK_FIXTURES[1]],
        manifest.labelFixtureIds,
      ),
    ).toThrow();
  });

  it("creates a deterministic paired schedule and rejects duplicate resume records", () => {
    const full = createSchedule("run");
    const preflight = createSchedule("preflight");
    expect(full).toHaveLength(300);
    expect(preflight).toHaveLength(10);
    expect(createSchedule("run")).toEqual(full);
    expect(remainingSchedule(full, [])).toHaveLength(300);
    const matching = full.find((item) => item.key === success.key);
    if (!matching) throw new Error("missing fixture");
    const saved = { ...success, order: matching.order };
    expect(remainingSchedule(full, [saved])).toHaveLength(299);
    expect(() => remainingSchedule(full, [saved, saved])).toThrow();
  });

  it("validates human labels and keeps the sheet blind to provider results", () => {
    const manifest = createDatasetManifest();
    const file: HumanLabelFile = {
      datasetHash: manifest.hash,
      rubricVersion: manifest.rubric.version,
      primaryRaterId: "human-a",
      labels: [
        {
          fixtureId: manifest.labelFixtureIds[0] as string,
          raterId: "human-a",
          labeledAt: "2026-09-24T00:00:00.000Z",
          levels,
        },
      ],
    };
    expect(parseHumanLabels(file, manifest).labels).toHaveLength(1);
    expect(() =>
      parseHumanLabels({ ...file, datasetHash: "0".repeat(64) }, manifest),
    ).toThrow();
    expect(createHumanLabelSheet(manifest)).toContain("The best feedback");
    expect(createHumanLabelSheet(manifest)).not.toContain("Provider score");
  });

  it("keeps failures in denominators and missing prices as unknown", () => {
    const summary = summarizeBenchmark([success, failure], null);
    expect(summary.providers.jev.attempts).toBe(2);
    expect(summary.providers.jev.schemaFailureRate).toBe(0.5);
    expect(summary.providers.jev.repeatability.comparisons).toBe(0);
    expect(summary.providers.jev.cost.estimatedTotalUsd).toBeNull();
    expect(summary.humanLabelsPending).toBe(true);
    expect(percentile([100, 10, 20, 30], 0.95)).toBe(100);
  });

  it("validates saved attempts and reports human and paired agreement", () => {
    expect(parseSavedAttempts(`${JSON.stringify(success)}\n`)).toEqual([
      success,
    ]);
    expect(() =>
      parseSavedAttempts(JSON.stringify({ ...success, key: "wrong" })),
    ).toThrow();
    expect(() =>
      parseSavedAttempts(JSON.stringify({ ...success, levels: { hook: 9 } })),
    ).toThrow();
    const llm: BenchmarkAttempt = {
      ...success,
      key: "strong-educational:1:openai-llm",
      provider: "openai-llm",
      requestedModel: "llm-fixed",
      resolvedModel: "llm-fixed",
      overallScore: 60,
    };
    const manifest = createDatasetManifest();
    const labelFile: HumanLabelFile = {
      datasetHash: manifest.hash,
      rubricVersion: manifest.rubric.version,
      primaryRaterId: "human-a",
      labels: [
        {
          fixtureId: "strong-educational",
          raterId: "human-a",
          labeledAt: "2026-09-24T00:00:00.000Z",
          levels,
        },
        {
          fixtureId: "strong-educational",
          raterId: "human-b",
          labeledAt: "2026-09-24T00:00:00.000Z",
          levels: { ...levels, hook: 3 },
        },
      ],
    };
    const price = {
      currency: "USD" as const,
      source: "provider pricing snapshot",
      effectiveDate: "2026-09-24",
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    };
    const summary = summarizeBenchmark([success, llm, failure], labelFile, {
      jev: price,
      "openai-llm": price,
    });
    expect(summary.pairedSuccessfulAttempts).toBe(1);
    expect(summary.pairedMeanScoreDifferenceLlmMinusJev).toBe(10);
    expect(summary.pairedComparisons[0]?.scoreDifferenceLlmMinusJev).toBe(10);
    expect(summary.providers.jev.cost.estimatedPerSuccessUsd).toBeCloseTo(
      0.00014,
    );
    expect(summary.providers.jev.cost.inputTokens).toBe(100);
    expect(summary.providers.jev.humanAgreement?.exactRate).toBe(1);
    expect(summary.interRaterAgreement?.pairedFixtureCount).toBe(1);
    expect(summary.providers.jev.cost.estimatedTotalUsd).toBeNull();
    expect(summary.providers.jev.cost.observedUsd).toBeCloseTo(0.00014);
  });

  it("reproduces a report from the same saved attempts and fixed timestamp", () => {
    const dataset = createDatasetManifest();
    const conditions = {
      runId: "fixture",
      mode: "preflight" as const,
      createdAt: "2026-09-24T00:00:00.000Z",
      dataset,
      protocolHash: "abc",
      codeRevision: "def",
      command: "pnpm benchmark preflight",
      seed: 8_2026,
      timeoutMs: 15_000,
      concurrency: 1 as const,
      llmOutputTokenBudget: 1600,
      llmTemperature: "provider-default",
      jevSdkVersion: "0.6.0",
      llmPromptVersion: "1.0.0",
      llmSchemaVersion: "1.0.0",
      models: { jev: "jev-fixed", "openai-llm": "llm-fixed" },
      retries: 0 as const,
      scheduledAttempts: 2,
      priceAssumptions: {},
      maximumEstimatedUsd: 1,
      providerSpendCapConfirmed: true,
    };
    const first = createBenchmarkReport(
      conditions,
      [success, failure],
      [success.key, failure.key],
      null,
      "2026-09-24T01:00:00.000Z",
    );
    const second = createBenchmarkReport(
      conditions,
      [success, failure],
      [success.key, failure.key],
      null,
      "2026-09-24T01:00:00.000Z",
    );
    expect(first).toEqual(second);
    expect(renderBenchmarkMarkdown(first)).toContain("Human labels: pending");
  });
});
