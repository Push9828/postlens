import type { EvaluationDimension } from "../types";
import { EVALUATION_DIMENSIONS } from "../types";
import type {
  V2BenchmarkAttempt,
  V2BenchmarkNumberDistribution,
  V2BenchmarkSummary,
} from "./types";

export function summarizeV2Benchmark(
  attempts: readonly V2BenchmarkAttempt[],
): V2BenchmarkSummary {
  const successes = attempts.filter(
    (attempt): attempt is Extract<V2BenchmarkAttempt, { status: "success" }> =>
      attempt.status === "success",
  );
  const failures = attempts.filter(
    (attempt): attempt is Extract<V2BenchmarkAttempt, { status: "failure" }> =>
      attempt.status === "failure",
  );
  const primaryTypeCounts = countBy(
    successes.map((item) => item.classification.primaryType),
  );
  const secondaryTypeCounts = countBy(
    successes.flatMap((item) =>
      item.classification.secondaryType
        ? [item.classification.secondaryType]
        : [],
    ),
  );
  const confidenceValues = successes.map(
    (item) => item.classification.confidence,
  );
  const fixtureGroups = groupBy(successes, (item) => item.fixtureId);
  const repeatPairs = [...fixtureGroups.values()].flatMap((group) =>
    combinations(group),
  );
  const dimensionPairDifferences = repeatPairs.flatMap(([a, b]) =>
    EVALUATION_DIMENSIONS.map((dimension) =>
      Math.abs(a.levels[dimension] - b.levels[dimension]),
    ),
  );

  return {
    attempts: attempts.length,
    successes: successes.length,
    failures: failures.length,
    failureKinds: countBy(failures.map((item) => item.errorKind)),
    failureRate: attempts.length ? failures.length / attempts.length : null,
    meanContentQuality: mean(
      successes.map((item) => item.scores.contentQuality),
    ),
    meanEngagementPotential: mean(
      successes.map((item) => item.scores.engagementPotential),
    ),
    meanQualityMinusEngagement: mean(
      successes.map(
        (item) => item.scores.contentQuality - item.scores.engagementPotential,
      ),
    ),
    scoreDistribution: {
      contentQuality: distribution(
        successes.map((item) => item.scores.contentQuality),
      ),
      engagementPotential: distribution(
        successes.map((item) => item.scores.engagementPotential),
      ),
    },
    latencyMs: {
      successfulP50: percentile(
        successes.map((item) => item.latencyMs),
        0.5,
      ),
      successfulP95: percentile(
        successes.map((item) => item.latencyMs),
        0.95,
      ),
      failedP50: percentile(
        failures.map((item) => item.latencyMs),
        0.5,
      ),
      failedP95: percentile(
        failures.map((item) => item.latencyMs),
        0.95,
      ),
      successfulCount: successes.length,
      failedCount: failures.length,
    },
    tokenUsage: {
      inputTokens: successes.reduce(
        (sum, item) => sum + (item.inputTokens ?? 0),
        0,
      ),
      outputTokens: successes.reduce(
        (sum, item) => sum + (item.outputTokens ?? 0),
        0,
      ),
      missingCount: successes.filter(
        (item) =>
          item.inputTokens === undefined || item.outputTokens === undefined,
      ).length,
    },
    primaryTypeCounts,
    secondaryTypeCounts,
    confidence: {
      mean: mean(confidenceValues),
      lowCount: confidenceValues.filter((value) => value < 0.55).length,
      mediumCount: confidenceValues.filter(
        (value) => value >= 0.55 && value < 0.75,
      ).length,
      highCount: confidenceValues.filter((value) => value >= 0.75).length,
    },
    repeatability: {
      fixtureCount: [...fixtureGroups.values()].filter(
        (group) => group.length > 1,
      ).length,
      primaryTypeExactRate: agreementRate(
        repeatPairs.map(
          ([a, b]) =>
            a.classification.primaryType === b.classification.primaryType,
        ),
      ),
      resolvedProfileExactRate: agreementRate(
        repeatPairs.map(
          ([a, b]) =>
            JSON.stringify(a.resolvedProfile) ===
            JSON.stringify(b.resolvedProfile),
        ),
      ),
      rawDimensionExactRate: agreementRate(
        dimensionPairDifferences.map((diff) => diff === 0),
      ),
      rawDimensionWithinOneRate: agreementRate(
        dimensionPairDifferences.map((diff) => diff <= 1),
      ),
      meanAbsoluteLevelDifference: mean(dimensionPairDifferences),
      meanAbsoluteConfidenceDifference: mean(
        repeatPairs.map(([a, b]) =>
          Math.abs(a.classification.confidence - b.classification.confidence),
        ),
      ),
      meanAbsoluteContentQualityDifference: mean(
        repeatPairs.map(([a, b]) =>
          Math.abs(a.scores.contentQuality - b.scores.contentQuality),
        ),
      ),
      meanAbsoluteEngagementPotentialDifference: mean(
        repeatPairs.map(([a, b]) =>
          Math.abs(a.scores.engagementPotential - b.scores.engagementPotential),
        ),
      ),
      contentQualityMeanWithinFixtureVariance: mean(
        [...fixtureGroups.values()]
          .filter((group) => group.length > 1)
          .map((group) =>
            populationVariance(group.map((item) => item.scores.contentQuality)),
          ),
      ),
      engagementPotentialMeanWithinFixtureVariance: mean(
        [...fixtureGroups.values()]
          .filter((group) => group.length > 1)
          .map((group) =>
            populationVariance(
              group.map((item) => item.scores.engagementPotential),
            ),
          ),
      ),
    },
    dimensionMeans: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        mean(successes.map((item) => item.dimensionScores[dimension])),
      ]),
    ) as Record<EvaluationDimension, number | null>,
    dimensionLevelCounts: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        Object.fromEntries(
          ([0, 1, 2, 3, 4] as const).map((level) => [
            level,
            successes.filter((item) => item.levels[dimension] === level).length,
          ]),
        ),
      ]),
    ) as V2BenchmarkSummary["dimensionLevelCounts"],
  };
}

export function percentile(
  values: readonly number[],
  quantile: number,
): number | null {
  if (!values.length) return null;
  if (quantile < 0 || quantile > 1)
    throw new Error("Quantile must be between 0 and 1.");
  const sorted = [...values].toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? null;
}

function agreementRate(values: readonly boolean[]): number | null {
  if (!values.length) return null;
  return values.filter(Boolean).length / values.length;
}

function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function populationVariance(values: readonly number[]): number {
  const average = mean(values) ?? 0;
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length
  );
}

function distribution(
  values: readonly number[],
): V2BenchmarkNumberDistribution {
  if (!values.length)
    return { min: null, p25: null, median: null, p75: null, max: null };
  return {
    min: Math.min(...values),
    p25: percentile(values, 0.25),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    max: Math.max(...values),
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, T[]> {
  return values.reduce((groups, value) => {
    const groupKey = key(value);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), value]);
    return groups;
  }, new Map<string, T[]>());
}

function combinations<T>(values: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let first = 0; first < values.length; first += 1) {
    for (let second = first + 1; second < values.length; second += 1) {
      const a = values[first];
      const b = values[second];
      if (a !== undefined && b !== undefined) pairs.push([a, b]);
    }
  }
  return pairs;
}
