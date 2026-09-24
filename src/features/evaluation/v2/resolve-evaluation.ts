import type { V2PostEvaluation } from "./evaluate-post";
import {
  calculatePostScores,
  resolveWeightProfile,
  scoreRawDimensions,
} from "./scoring";
import { EVALUATION_DIMENSIONS, type PostType } from "./types";

/** Change the interpretation of existing observations; never request new judgments. */
export function withPostTypeOverride(
  evaluation: V2PostEvaluation,
  postType?: PostType,
): V2PostEvaluation {
  const dimensionScores = scoreRawDimensions(evaluation.rawEvaluation);
  const resolvedProfile = resolveWeightProfile(
    evaluation.detectedClassification,
    postType,
  );
  return {
    ...evaluation,
    dimensionScores,
    resolvedProfile,
    scores: calculatePostScores(dimensionScores, resolvedProfile),
  };
}

export function isConsistentV2Evaluation(
  evaluation: V2PostEvaluation,
): boolean {
  try {
    const override =
      evaluation.resolvedProfile.source === "user-override"
        ? evaluation.resolvedProfile.resolvedPostType
        : undefined;
    if (override === "generic") return false;
    const calculated = withPostTypeOverride(evaluation, override);
    return (
      calculated.resolvedProfile.source === evaluation.resolvedProfile.source &&
      calculated.resolvedProfile.resolvedPostType ===
        evaluation.resolvedProfile.resolvedPostType &&
      calculated.resolvedProfile.secondaryType ===
        evaluation.resolvedProfile.secondaryType &&
      EVALUATION_DIMENSIONS.every(
        (dimension) =>
          calculated.dimensionScores[dimension] ===
            evaluation.dimensionScores[dimension] &&
          Math.abs(
            calculated.resolvedProfile.qualityWeights[dimension] -
              evaluation.resolvedProfile.qualityWeights[dimension],
          ) < 1e-8 &&
          Math.abs(
            calculated.resolvedProfile.engagementWeights[dimension] -
              evaluation.resolvedProfile.engagementWeights[dimension],
          ) < 1e-8,
      ) &&
      Math.abs(
        calculated.scores.contentQuality - evaluation.scores.contentQuality,
      ) < 1e-8 &&
      Math.abs(
        calculated.scores.engagementPotential -
          evaluation.scores.engagementPotential,
      ) < 1e-8
    );
  } catch {
    return false;
  }
}
