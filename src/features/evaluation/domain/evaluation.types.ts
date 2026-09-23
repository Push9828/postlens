export const EVALUATION_DIMENSIONS = [
  "hook",
  "specificity",
  "novelty",
  "clarity",
  "discussionPotential",
  "credibility",
  "skimmability",
  "emotionalResonance",
] as const;

export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];

export const EVALUATION_LEVELS = [0, 1, 2, 3, 4] as const;

export type EvaluationLevel = (typeof EVALUATION_LEVELS)[number];

export const CONTENT_TYPES = [
  "educational",
  "story",
  "opinion",
  "case-study",
  "reflection",
  "announcement",
  "build-in-public",
  "other",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export interface EvaluatePostInput {
  readonly content: string;
}

export interface DimensionJudgment {
  readonly level: EvaluationLevel;
  readonly explanation: string;
  /** Provider confidence normalized to the inclusive range 0–1, when available. */
  readonly confidence?: number;
}

export interface PostJudgments {
  readonly dimensions: Readonly<Record<EvaluationDimension, DimensionJudgment>>;
  readonly contentType: ContentType;
  readonly summary: string;
}

export type DimensionScore = 0 | 25 | 50 | 75 | 100;

export type ScoreInterpretationId =
  | "needs-substantial-work"
  | "developing"
  | "solid"
  | "strong"
  | "exceptional";

export interface ScoreInterpretation {
  readonly id: ScoreInterpretationId;
  readonly label: string;
  readonly minimumScore: number;
  readonly maximumScore: number;
}

export interface DimensionEvaluation extends DimensionJudgment {
  readonly score: DimensionScore;
}

export interface RubricReference {
  readonly id: string;
  readonly version: string;
}

export interface PostEvaluation {
  readonly rubric: RubricReference;
  readonly overallScore: number;
  readonly scoreInterpretation: ScoreInterpretation;
  readonly dimensions: Readonly<
    Record<EvaluationDimension, DimensionEvaluation>
  >;
  readonly strongestDimension: EvaluationDimension;
  readonly weakestDimension: EvaluationDimension;
  readonly contentType: ContentType;
  readonly summary: string;
}
