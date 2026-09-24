import type {
  CalculatedPostScores,
  DimensionScores,
  EvaluationDimension,
  EvaluationLevel,
  PostTypeClassification,
  ResolvedWeightProfile,
  RUBRIC_VERSION,
} from "../types";

export interface V2BenchmarkAttemptBase {
  readonly key: string;
  readonly fixtureId: string;
  readonly category: string;
  readonly repetition: number;
  readonly recordedAt: string;
  readonly characterCount: number;
  readonly contentHash: string;
  readonly requestedModel: string;
  readonly resolvedModel?: string;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export type V2BenchmarkAttempt =
  | (V2BenchmarkAttemptBase & {
      readonly status: "success";
      readonly classification: PostTypeClassification;
      readonly resolvedProfile: ResolvedWeightProfile;
      readonly levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>;
      readonly dimensionScores: DimensionScores;
      readonly scores: CalculatedPostScores;
    })
  | (V2BenchmarkAttemptBase & {
      readonly status: "failure";
      readonly errorKind: string;
    });

export interface V2BenchmarkConditions {
  readonly schemaVersion: 1;
  readonly rubricVersion: typeof RUBRIC_VERSION;
  readonly datasetVersion: string;
  readonly datasetHash: string;
  readonly fixtures: readonly {
    readonly id: string;
    readonly category: string;
    readonly characterCount: number;
    readonly contentHash: string;
  }[];
  readonly createdAt: string;
  readonly completedAt: string;
  readonly codeRevision: string;
  readonly requestedModel: string;
  readonly timeoutMs: number;
  readonly retries: 0;
  readonly fixtureIds: readonly string[];
  readonly repetitions: number;
  readonly scheduledAttempts: number;
  readonly completedAttempts: number;
}

export interface V2BenchmarkReport {
  readonly conditions: V2BenchmarkConditions;
  readonly attempts: readonly V2BenchmarkAttempt[];
  readonly summary: V2BenchmarkSummary;
}

export interface V2BenchmarkSummary {
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly failureKinds: Readonly<Record<string, number>>;
  readonly failureRate: number | null;
  readonly meanContentQuality: number | null;
  readonly meanEngagementPotential: number | null;
  readonly meanQualityMinusEngagement: number | null;
  readonly scoreDistribution: {
    readonly contentQuality: V2BenchmarkNumberDistribution;
    readonly engagementPotential: V2BenchmarkNumberDistribution;
  };
  readonly latencyMs: {
    readonly successfulP50: number | null;
    readonly successfulP95: number | null;
    readonly failedP50: number | null;
    readonly failedP95: number | null;
    readonly successfulCount: number;
    readonly failedCount: number;
  };
  readonly tokenUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly missingCount: number;
  };
  readonly primaryTypeCounts: Readonly<Record<string, number>>;
  readonly secondaryTypeCounts: Readonly<Record<string, number>>;
  readonly confidence: {
    readonly mean: number | null;
    readonly lowCount: number;
    readonly mediumCount: number;
    readonly highCount: number;
  };
  readonly repeatability: {
    readonly fixtureCount: number;
    readonly primaryTypeExactRate: number | null;
    readonly resolvedProfileExactRate: number | null;
    readonly rawDimensionExactRate: number | null;
    readonly rawDimensionWithinOneRate: number | null;
    readonly meanAbsoluteLevelDifference: number | null;
    readonly meanAbsoluteConfidenceDifference: number | null;
    readonly meanAbsoluteContentQualityDifference: number | null;
    readonly meanAbsoluteEngagementPotentialDifference: number | null;
    readonly contentQualityMeanWithinFixtureVariance: number | null;
    readonly engagementPotentialMeanWithinFixtureVariance: number | null;
  };
  readonly dimensionMeans: Readonly<Record<EvaluationDimension, number | null>>;
  readonly dimensionLevelCounts: Readonly<
    Record<EvaluationDimension, Readonly<Record<0 | 1 | 2 | 3 | 4, number>>>
  >;
}

export interface V2BenchmarkNumberDistribution {
  readonly min: number | null;
  readonly p25: number | null;
  readonly median: number | null;
  readonly p75: number | null;
  readonly max: number | null;
}
