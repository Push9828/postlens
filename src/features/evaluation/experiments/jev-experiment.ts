import type { PostEvaluatorErrorKind } from "../application/post-evaluator";
import type {
  EvaluationDimension,
  PostEvaluation,
} from "../domain/evaluation.types";
import type {
  JevEvaluationDiagnostics,
  JevExplanationMode,
} from "../infrastructure/jev/jev.types";

interface JevExperimentRunBase {
  readonly fixtureId: string;
  readonly category: string;
  readonly repetition: number;
  readonly explanationMode: JevExplanationMode;
  readonly recordedAt: string;
}

export interface SuccessfulJevExperimentRun extends JevExperimentRunBase {
  readonly status: "success";
  readonly evaluation: PostEvaluation;
  readonly diagnostics: JevEvaluationDiagnostics;
}

export interface FailedJevExperimentRun extends JevExperimentRunBase {
  readonly status: "failure";
  readonly errorKind: PostEvaluatorErrorKind;
}

export type JevExperimentRun =
  | SuccessfulJevExperimentRun
  | FailedJevExperimentRun;

export interface JevExperimentSummary {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly successRate: number;
  readonly latencyMs: {
    readonly p50: number | null;
    readonly p95: number | null;
  };
  readonly repeatability: {
    readonly comparisonCount: number;
    readonly exactAgreementRate: number | null;
    readonly withinOneLevelRate: number | null;
    readonly largeDifferenceRate: number | null;
  };
  readonly failuresByKind: Readonly<
    Partial<Record<PostEvaluatorErrorKind, number>>
  >;
}

export type JevBatchingMode = "batched" | "parallel-separate";

export interface JevBatchingMeasurement {
  readonly mode: JevBatchingMode;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface JevBatchingSummaryEntry {
  readonly measurementCount: number;
  readonly latencyMs: {
    readonly p50: number | null;
    readonly p95: number | null;
  };
  readonly averageInputTokens: number | null;
  readonly averageOutputTokens: number | null;
}

export type JevBatchingSummary = Readonly<
  Record<JevBatchingMode, JevBatchingSummaryEntry>
>;

export function summarizeJevExperiment(
  runs: readonly JevExperimentRun[],
): JevExperimentSummary {
  const successfulRuns = runs.filter(
    (run): run is SuccessfulJevExperimentRun => run.status === "success",
  );
  const failedRuns = runs.filter(
    (run): run is FailedJevExperimentRun => run.status === "failure",
  );
  const latencies = successfulRuns.map((run) => run.diagnostics.latencyMs);
  const differences = collectRepeatedLevelDifferences(successfulRuns);
  const exact = differences.filter((difference) => difference === 0).length;
  const withinOne = differences.filter((difference) => difference <= 1).length;
  const large = differences.filter((difference) => difference >= 2).length;

  return {
    totalRuns: runs.length,
    successfulRuns: successfulRuns.length,
    failedRuns: failedRuns.length,
    successRate: runs.length === 0 ? 0 : successfulRuns.length / runs.length,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    repeatability: {
      comparisonCount: differences.length,
      exactAgreementRate: rateOrNull(exact, differences.length),
      withinOneLevelRate: rateOrNull(withinOne, differences.length),
      largeDifferenceRate: rateOrNull(large, differences.length),
    },
    failuresByKind: countFailures(failedRuns),
  };
}

export function summarizeJevBatchingExperiment(
  measurements: readonly JevBatchingMeasurement[],
): JevBatchingSummary {
  return {
    batched: summarizeBatchingMode(measurements, "batched"),
    "parallel-separate": summarizeBatchingMode(
      measurements,
      "parallel-separate",
    ),
  };
}

function summarizeBatchingMode(
  measurements: readonly JevBatchingMeasurement[],
  mode: JevBatchingMode,
): JevBatchingSummaryEntry {
  const matches = measurements.filter(
    (measurement) => measurement.mode === mode,
  );
  const count = matches.length;

  return {
    measurementCount: count,
    latencyMs: {
      p50: percentile(
        matches.map((measurement) => measurement.latencyMs),
        0.5,
      ),
      p95: percentile(
        matches.map((measurement) => measurement.latencyMs),
        0.95,
      ),
    },
    averageInputTokens:
      count === 0
        ? null
        : matches.reduce(
            (total, measurement) => total + measurement.inputTokens,
            0,
          ) / count,
    averageOutputTokens:
      count === 0
        ? null
        : matches.reduce(
            (total, measurement) => total + measurement.outputTokens,
            0,
          ) / count,
  };
}

function collectRepeatedLevelDifferences(
  runs: readonly SuccessfulJevExperimentRun[],
): number[] {
  const groups = new Map<string, SuccessfulJevExperimentRun[]>();

  for (const run of runs) {
    const key = `${run.fixtureId}:${run.explanationMode}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }

  const differences: number[] = [];

  for (const group of groups.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < group.length;
        rightIndex += 1
      ) {
        const left = group[leftIndex];
        const right = group[rightIndex];

        if (left === undefined || right === undefined) {
          continue;
        }

        for (const dimension of Object.keys(
          left.evaluation.dimensions,
        ) as EvaluationDimension[]) {
          differences.push(
            Math.abs(
              left.evaluation.dimensions[dimension].level -
                right.evaluation.dimensions[dimension].level,
            ),
          );
        }
      }
    }
  }

  return differences;
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);

  return sorted[index] ?? null;
}

function rateOrNull(count: number, total: number): number | null {
  return total === 0 ? null : count / total;
}

function countFailures(
  runs: readonly FailedJevExperimentRun[],
): Partial<Record<PostEvaluatorErrorKind, number>> {
  const counts: Partial<Record<PostEvaluatorErrorKind, number>> = {};

  for (const run of runs) {
    counts[run.errorKind] = (counts[run.errorKind] ?? 0) + 1;
  }

  return counts;
}
