export const RUBRIC_VERSION = "2.0";

export const POST_TYPES = [
  "educational",
  "opinion",
  "story",
  "case-study",
  "reflection",
  "announcement",
  "build-in-public",
  "discussion",
] as const;

export type PostType = (typeof POST_TYPES)[number];

export const EVALUATION_DIMENSIONS = [
  "hook",
  "clarity",
  "credibility",
  "specificity",
  "novelty",
  "relevanceValue",
  "readabilityStructure",
  "readerResonance",
  "conversationPotential",
] as const;

export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];
export type EvaluationLevel = 0 | 1 | 2 | 3 | 4;
export type DimensionScores = Readonly<Record<EvaluationDimension, number>>;
export type DimensionWeights = Readonly<Record<EvaluationDimension, number>>;

export interface PostTypeClassification {
  readonly primaryType: PostType;
  readonly secondaryType?: PostType;
  readonly confidence: number;
  readonly reasoning: string;
}

export interface DimensionJudgment {
  readonly level: EvaluationLevel;
  readonly explanation: string;
  readonly confidence?: number;
}

export interface RawPostEvaluation {
  readonly dimensions: Readonly<Record<EvaluationDimension, DimensionJudgment>>;
}

export type ClassificationResolutionSource =
  | "ai-primary"
  | "ai-blended"
  | "generic-fallback"
  | "user-override";

export interface WeightProfile {
  readonly qualityWeights: DimensionWeights;
  readonly engagementWeights: DimensionWeights;
}

export interface ResolvedWeightProfile extends WeightProfile {
  readonly source: ClassificationResolutionSource;
  readonly resolvedPostType: PostType | "generic";
  readonly secondaryType?: PostType;
}

/** Unrounded calculated values; round when constructing a displayed result. */
export interface CalculatedPostScores {
  readonly contentQuality: number;
  readonly engagementPotential: number;
}
