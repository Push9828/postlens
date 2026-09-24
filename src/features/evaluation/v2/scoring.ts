import { GENERIC_PROFILE, POST_TYPE_PROFILES } from "./profiles";
import { NORMALIZED_SCORE_BY_LEVEL } from "./rubric";
import {
  type CalculatedPostScores,
  type DimensionScores,
  type DimensionWeights,
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  POST_TYPES,
  type PostType,
  type PostTypeClassification,
  type RawPostEvaluation,
  type ResolvedWeightProfile,
  type WeightProfile,
} from "./types";

const WEIGHT_TOLERANCE = 1e-8;

export class V2ScoringInputError extends Error {
  override readonly name = "V2ScoringInputError";
}

export function validateWeights(weights: DimensionWeights): void {
  if (Object.keys(weights).length !== EVALUATION_DIMENSIONS.length) {
    throw new V2ScoringInputError(
      "Weight profile must define exactly nine dimensions.",
    );
  }
  const total = EVALUATION_DIMENSIONS.reduce((sum, dimension) => {
    const weight = weights[dimension];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new V2ScoringInputError(`Invalid weight for ${dimension}.`);
    }
    return sum + weight;
  }, 0);
  if (Math.abs(total - 100) > WEIGHT_TOLERANCE) {
    throw new V2ScoringInputError(`Weights must total 100; received ${total}.`);
  }
}

export function blendWeights(
  primary: DimensionWeights,
  secondary: DimensionWeights,
): DimensionWeights {
  validateWeights(primary);
  validateWeights(secondary);
  const blended = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      primary[dimension] * 0.7 + secondary[dimension] * 0.3,
    ]),
  ) as DimensionWeights;
  const total = EVALUATION_DIMENSIONS.reduce(
    (sum, dimension) => sum + blended[dimension],
    0,
  );
  const normalized = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      (blended[dimension] * 100) / total,
    ]),
  ) as DimensionWeights;
  validateWeights(normalized);
  return normalized;
}

export function resolveWeightProfile(
  classification: PostTypeClassification,
  override?: PostType,
): ResolvedWeightProfile {
  assertPostType(classification.primaryType);
  if (classification.secondaryType !== undefined) {
    assertPostType(classification.secondaryType);
  }
  if (
    !Number.isFinite(classification.confidence) ||
    classification.confidence < 0 ||
    classification.confidence > 1
  ) {
    throw new V2ScoringInputError(
      "Classification confidence must be between 0 and 1.",
    );
  }
  if (override !== undefined) {
    assertPostType(override);
    return {
      ...POST_TYPE_PROFILES[override],
      source: "user-override",
      resolvedPostType: override,
    };
  }
  if (classification.confidence < 0.55) {
    return {
      ...GENERIC_PROFILE,
      source: "generic-fallback",
      resolvedPostType: "generic",
    };
  }
  const primary = classification.primaryType;
  const secondary = classification.secondaryType;
  if (
    classification.confidence < 0.75 &&
    secondary !== undefined &&
    secondary !== primary
  ) {
    return {
      qualityWeights: blendWeights(
        POST_TYPE_PROFILES[primary].qualityWeights,
        POST_TYPE_PROFILES[secondary].qualityWeights,
      ),
      engagementWeights: blendWeights(
        POST_TYPE_PROFILES[primary].engagementWeights,
        POST_TYPE_PROFILES[secondary].engagementWeights,
      ),
      source: "ai-blended",
      resolvedPostType: primary,
      secondaryType: secondary,
    };
  }
  return {
    ...POST_TYPE_PROFILES[primary],
    source: "ai-primary",
    resolvedPostType: primary,
  };
}

export function scoreRawDimensions(raw: RawPostEvaluation): DimensionScores {
  if (Object.keys(raw.dimensions).length !== EVALUATION_DIMENSIONS.length) {
    throw new V2ScoringInputError(
      "Raw evaluation must contain exactly nine dimensions.",
    );
  }
  return Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => {
      const level = raw.dimensions[dimension]?.level;
      if (level === undefined || !isEvaluationLevel(level)) {
        throw new V2ScoringInputError(`Invalid level for ${dimension}.`);
      }
      return [dimension, NORMALIZED_SCORE_BY_LEVEL[level]];
    }),
  ) as DimensionScores;
}

export function calculateScore(
  dimensions: DimensionScores,
  weights: DimensionWeights,
): number {
  validateWeights(weights);
  return EVALUATION_DIMENSIONS.reduce((sum, dimension) => {
    const score = dimensions[dimension];
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new V2ScoringInputError(`Invalid score for ${dimension}.`);
    }
    return sum + score * (weights[dimension] / 100);
  }, 0);
}

export function calculatePostScores(
  dimensions: DimensionScores,
  profile: WeightProfile,
): CalculatedPostScores {
  let contentQuality = calculateScore(dimensions, profile.qualityWeights);
  if (dimensions.clarity < 40) contentQuality = Math.min(contentQuality, 65);
  if (dimensions.credibility < 40)
    contentQuality = Math.min(contentQuality, 60);
  return {
    contentQuality,
    engagementPotential: calculateScore(dimensions, profile.engagementWeights),
  };
}

export function roundPostScores(
  scores: CalculatedPostScores,
): CalculatedPostScores {
  return {
    contentQuality: Math.round(scores.contentQuality),
    engagementPotential: Math.round(scores.engagementPotential),
  };
}

function isEvaluationLevel(value: number): value is EvaluationLevel {
  return Number.isInteger(value) && value >= 0 && value <= 4;
}

function assertPostType(value: PostType): void {
  if (!POST_TYPES.includes(value)) {
    throw new V2ScoringInputError(`Invalid post type: ${String(value)}.`);
  }
}
