import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "../domain/evaluation.types";
import type {
  BenchmarkAttempt,
  BenchmarkProvider,
  HumanLabelFile,
  TokenPrices,
} from "./benchmark.types";

export interface AgreementSummary {
  readonly comparisons: number;
  readonly exactRate: number | null;
  readonly withinOneRate: number | null;
  readonly largeDifferenceRate: number | null;
  readonly meanAbsoluteDifference: number | null;
}

export interface ProviderSummary {
  readonly attempts: number;
  readonly successes: number;
  readonly meanOverallScore: number | null;
  readonly failures: Readonly<Record<string, number>>;
  readonly failureRate: number | null;
  readonly schemaFailureRate: number | null;
  readonly domainValidationFailureRate: number | null;
  readonly timeoutRate: number | null;
  readonly retryCount: 0;
  readonly latencyMs: {
    readonly successfulSampleCount: number;
    readonly failedSampleCount: number;
    readonly evaluatorP50: number | null;
    readonly evaluatorP95: number | null;
    readonly totalP50: number | null;
    readonly totalP95: number | null;
    readonly failedTotalP50: number | null;
  };
  readonly repeatability: AgreementSummary & {
    readonly fixtureCount: number;
    readonly meanScoreVariance: number | null;
    readonly contentTypeAgreementRate: number | null;
    readonly byDimension: Readonly<
      Record<EvaluationDimension, AgreementSummary>
    >;
  };
  readonly humanAgreement:
    | (AgreementSummary & {
        readonly labeledFixtureCount: number;
        readonly coveredFixtureCount: number;
        readonly byDimension: Readonly<
          Record<EvaluationDimension, AgreementSummary>
        >;
      })
    | null;
  readonly cost: {
    readonly currency: "USD";
    readonly estimatedTotalUsd: number | null;
    readonly estimatedPerSuccessUsd: number | null;
    readonly observedUsd: number | null;
    readonly missingUsageCount: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly priceSource: string | null;
  };
}

export interface BenchmarkSummary {
  readonly providers: Readonly<Record<BenchmarkProvider, ProviderSummary>>;
  readonly pairedComparisons: readonly {
    readonly fixtureId: string;
    readonly repetition: number;
    readonly scoreDifferenceLlmMinusJev: number;
    readonly levelDifferencesLlmMinusJev: Readonly<
      Record<EvaluationDimension, number>
    >;
  }[];
  readonly pairedSuccessfulAttempts: number;
  readonly pairedMeanScoreDifferenceLlmMinusJev: number | null;
  readonly pairedMeanLevelDifferenceLlmMinusJev: Readonly<
    Record<EvaluationDimension, number | null>
  >;
  readonly interRaterAgreement:
    | (AgreementSummary & { readonly pairedFixtureCount: number })
    | null;
  readonly humanLabelsPending: boolean;
}

export function summarizeBenchmark(
  attempts: readonly BenchmarkAttempt[],
  labelFile: HumanLabelFile | null,
  prices: Partial<Record<BenchmarkProvider, TokenPrices>> = {},
): BenchmarkSummary {
  const byProvider = {
    jev: summarizeProvider(
      attempts.filter((attempt) => attempt.provider === "jev"),
      labelFile,
      prices.jev,
    ),
    "openai-llm": summarizeProvider(
      attempts.filter((attempt) => attempt.provider === "openai-llm"),
      labelFile,
      prices["openai-llm"],
    ),
  };
  const jev = new Map(
    attempts
      .filter(
        (
          attempt,
        ): attempt is Extract<BenchmarkAttempt, { status: "success" }> =>
          attempt.provider === "jev" && attempt.status === "success",
      )
      .map((attempt) => [
        `${attempt.fixtureId}:${attempt.repetition}`,
        attempt,
      ]),
  );
  const pairedLevelDifferences = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, [] as number[]]),
  ) as Record<EvaluationDimension, number[]>;
  const pairedComparisons: BenchmarkSummary["pairedComparisons"][number][] = [];
  const differences = attempts
    .filter(
      (attempt): attempt is Extract<BenchmarkAttempt, { status: "success" }> =>
        attempt.provider === "openai-llm" && attempt.status === "success",
    )
    .flatMap((attempt) => {
      const match = jev.get(`${attempt.fixtureId}:${attempt.repetition}`);
      if (!match) return [];
      const levelDifferences = Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          dimension,
          attempt.levels[dimension] - match.levels[dimension],
        ]),
      ) as Record<EvaluationDimension, number>;
      for (const dimension of EVALUATION_DIMENSIONS)
        pairedLevelDifferences[dimension].push(levelDifferences[dimension]);
      pairedComparisons.push({
        fixtureId: attempt.fixtureId,
        repetition: attempt.repetition,
        scoreDifferenceLlmMinusJev: attempt.overallScore - match.overallScore,
        levelDifferencesLlmMinusJev: levelDifferences,
      });
      return [attempt.overallScore - match.overallScore];
    });
  return {
    providers: byProvider,
    pairedComparisons: pairedComparisons.sort(
      (a, b) =>
        a.fixtureId.localeCompare(b.fixtureId) || a.repetition - b.repetition,
    ),
    pairedSuccessfulAttempts: differences.length,
    pairedMeanScoreDifferenceLlmMinusJev: mean(differences),
    pairedMeanLevelDifferenceLlmMinusJev: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        mean(pairedLevelDifferences[dimension]),
      ]),
    ) as Record<EvaluationDimension, number | null>,
    interRaterAgreement: labelFile ? compareRaters(labelFile) : null,
    humanLabelsPending:
      labelFile === null ||
      labelFile.labels.filter(
        (label) => label.raterId === labelFile.primaryRaterId,
      ).length < 24,
  };
}

function summarizeProvider(
  attempts: readonly BenchmarkAttempt[],
  labelFile: HumanLabelFile | null,
  prices?: TokenPrices,
): ProviderSummary {
  const successes = attempts.filter(
    (attempt): attempt is Extract<BenchmarkAttempt, { status: "success" }> =>
      attempt.status === "success",
  );
  const failures = attempts.filter(
    (attempt): attempt is Extract<BenchmarkAttempt, { status: "failure" }> =>
      attempt.status === "failure",
  );
  const failureCounts: Record<string, number> = {};
  for (const failure of failures)
    failureCounts[failure.errorKind] =
      (failureCounts[failure.errorKind] ?? 0) + 1;
  const groups = new Map<string, typeof successes>();
  for (const success of successes)
    groups.set(success.fixtureId, [
      ...(groups.get(success.fixtureId) ?? []),
      success,
    ]);
  const differences: number[] = [];
  const perDimension = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, [] as number[]]),
  ) as Record<EvaluationDimension, number[]>;
  const contentTypeMatches: boolean[] = [];
  const scoreVariances: number[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const scoreMean = mean(group.map((attempt) => attempt.overallScore)) ?? 0;
    scoreVariances.push(
      mean(group.map((attempt) => (attempt.overallScore - scoreMean) ** 2)) ??
        0,
    );
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i];
        const right = group[j];
        if (!left || !right) continue;
        for (const dimension of EVALUATION_DIMENSIONS) {
          const difference = Math.abs(
            left.levels[dimension] - right.levels[dimension],
          );
          differences.push(difference);
          perDimension[dimension].push(difference);
        }
        contentTypeMatches.push(left.contentType === right.contentType);
      }
    }
  }
  const usageMissing = attempts.filter(
    (attempt) =>
      attempt.status === "failure" ||
      attempt.inputTokens === null ||
      attempt.outputTokens === null,
  ).length;
  const observedCost = prices
    ? successes.reduce(
        (total, attempt) =>
          total +
          ((attempt.inputTokens ?? 0) * prices.inputUsdPerMillion) / 1_000_000 +
          ((attempt.outputTokens ?? 0) * prices.outputUsdPerMillion) /
            1_000_000,
        0,
      )
    : null;
  const completeUsageSuccesses = successes.filter(
    (attempt) => attempt.inputTokens !== null && attempt.outputTokens !== null,
  );
  const estimatedPerSuccessUsd =
    prices &&
    completeUsageSuccesses.length === successes.length &&
    successes.length
      ? (observedCost ?? 0) / successes.length
      : null;
  return {
    attempts: attempts.length,
    successes: successes.length,
    meanOverallScore: mean(successes.map((attempt) => attempt.overallScore)),
    failures: failureCounts,
    failureRate: attempts.length ? failures.length / attempts.length : null,
    schemaFailureRate: attempts.length
      ? (failureCounts["invalid-response"] ?? 0) / attempts.length
      : null,
    domainValidationFailureRate: attempts.length
      ? (failureCounts["domain-validation"] ?? 0) / attempts.length
      : null,
    timeoutRate: attempts.length
      ? (failureCounts.timeout ?? 0) / attempts.length
      : null,
    retryCount: 0,
    latencyMs: {
      successfulSampleCount: successes.length,
      failedSampleCount: failures.length,
      evaluatorP50: percentile(
        successes.flatMap((attempt) =>
          attempt.evaluatorLatencyMs === null
            ? []
            : [attempt.evaluatorLatencyMs],
        ),
        0.5,
      ),
      evaluatorP95: percentile(
        successes.flatMap((attempt) =>
          attempt.evaluatorLatencyMs === null
            ? []
            : [attempt.evaluatorLatencyMs],
        ),
        0.95,
      ),
      totalP50: percentile(
        successes.map((attempt) => attempt.totalLatencyMs),
        0.5,
      ),
      totalP95: percentile(
        successes.map((attempt) => attempt.totalLatencyMs),
        0.95,
      ),
      failedTotalP50: percentile(
        failures.map((attempt) => attempt.totalLatencyMs),
        0.5,
      ),
    },
    repeatability: {
      ...agreement(differences),
      fixtureCount: scoreVariances.length,
      meanScoreVariance: mean(scoreVariances),
      contentTypeAgreementRate: contentTypeMatches.length
        ? contentTypeMatches.filter(Boolean).length / contentTypeMatches.length
        : null,
      byDimension: Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          dimension,
          agreement(perDimension[dimension]),
        ]),
      ) as Record<EvaluationDimension, AgreementSummary>,
    },
    humanAgreement: labelFile ? compareHuman(groups, labelFile) : null,
    cost: {
      currency: "USD",
      estimatedTotalUsd:
        observedCost !== null && usageMissing === 0 ? observedCost : null,
      estimatedPerSuccessUsd,
      observedUsd: observedCost,
      missingUsageCount: usageMissing,
      inputTokens: completeUsageSuccesses.reduce(
        (total, attempt) => total + (attempt.inputTokens ?? 0),
        0,
      ),
      outputTokens: completeUsageSuccesses.reduce(
        (total, attempt) => total + (attempt.outputTokens ?? 0),
        0,
      ),
      priceSource: prices?.source ?? null,
    },
  };
}

function compareHuman(
  groups: ReadonlyMap<
    string,
    readonly Extract<BenchmarkAttempt, { status: "success" }>[]
  >,
  labelFile: HumanLabelFile,
): NonNullable<ProviderSummary["humanAgreement"]> {
  const labels = labelFile.labels.filter(
    (label) => label.raterId === labelFile.primaryRaterId,
  );
  const differences: number[] = [];
  const perDimension = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, [] as number[]]),
  ) as Record<EvaluationDimension, number[]>;
  let coveredFixtureCount = 0;
  for (const label of labels) {
    const group = groups.get(label.fixtureId);
    if (!group?.length) continue;
    coveredFixtureCount += 1;
    for (const dimension of EVALUATION_DIMENSIONS) {
      const sorted = group
        .map((attempt) => attempt.levels[dimension])
        .sort((a, b) => a - b);
      const consensus = sorted[
        Math.floor((sorted.length - 1) / 2)
      ] as EvaluationLevel;
      const difference = Math.abs(consensus - label.levels[dimension]);
      differences.push(difference);
      perDimension[dimension].push(difference);
    }
  }
  return {
    ...agreement(differences),
    labeledFixtureCount: labels.length,
    coveredFixtureCount,
    byDimension: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        agreement(perDimension[dimension]),
      ]),
    ) as Record<EvaluationDimension, AgreementSummary>,
  };
}

function compareRaters(
  labelFile: HumanLabelFile,
): BenchmarkSummary["interRaterAgreement"] {
  const primary = new Map(
    labelFile.labels
      .filter((label) => label.raterId === labelFile.primaryRaterId)
      .map((label) => [label.fixtureId, label]),
  );
  const secondary = labelFile.labels.filter(
    (label) => label.raterId !== labelFile.primaryRaterId,
  );
  if (!secondary.length) return null;
  const differences: number[] = [];
  const fixtureIds = new Set<string>();
  for (const label of secondary) {
    const match = primary.get(label.fixtureId);
    if (!match) continue;
    fixtureIds.add(label.fixtureId);
    for (const dimension of EVALUATION_DIMENSIONS)
      differences.push(
        Math.abs(label.levels[dimension] - match.levels[dimension]),
      );
  }
  return { ...agreement(differences), pairedFixtureCount: fixtureIds.size };
}

function agreement(differences: readonly number[]): AgreementSummary {
  const count = differences.length;
  return {
    comparisons: count,
    exactRate: count ? differences.filter((d) => d === 0).length / count : null,
    withinOneRate: count
      ? differences.filter((d) => d <= 1).length / count
      : null,
    largeDifferenceRate: count
      ? differences.filter((d) => d >= 2).length / count
      : null,
    meanAbsoluteDifference: mean(differences),
  };
}

export function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? null;
}

function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
