import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type PostEvaluation,
} from "./evaluation.types";
import { POSTLENS_RUBRIC } from "./rubric";

export interface PostComparison {
  readonly overallDelta: number;
  readonly dimensionDeltas: Readonly<Record<EvaluationDimension, number>>;
  readonly winner: "A" | "B" | "tie";
  readonly summary: string;
}

export class ComparisonInputError extends Error {
  override readonly name = "ComparisonInputError";
}

export function compareEvaluations(
  versionA: PostEvaluation,
  versionB: PostEvaluation,
): PostComparison {
  if (
    versionA.rubric.id !== versionB.rubric.id ||
    versionA.rubric.version !== versionB.rubric.version ||
    versionA.rubric.id !== POSTLENS_RUBRIC.id ||
    versionA.rubric.version !== POSTLENS_RUBRIC.version
  ) {
    throw new ComparisonInputError("Evaluations must use the current rubric.");
  }

  const overallDelta = versionB.overallScore - versionA.overallScore;
  const dimensionDeltas = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      versionB.dimensions[dimension].score -
        versionA.dimensions[dimension].score,
    ]),
  ) as Readonly<Record<EvaluationDimension, number>>;
  const winner = overallDelta > 0 ? "B" : overallDelta < 0 ? "A" : "tie";
  const base =
    winner === "tie"
      ? "Versions A and B have the same Post Potential against the current PostLens rubric."
      : `Version ${winner} scores ${Math.abs(overallDelta)} ${Math.abs(overallDelta) === 1 ? "point" : "points"} higher against the current PostLens rubric.`;
  const largestDifferences = EVALUATION_DIMENSIONS.map((dimension, index) => ({
    dimension,
    delta: dimensionDeltas[dimension],
    index,
  }))
    .filter(({ delta }) => delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        left.index - right.index,
    )
    .slice(0, 2)
    .map(
      ({ dimension, delta }) =>
        `${POSTLENS_RUBRIC.dimensions[dimension].label} (${Math.abs(delta)} for ${delta > 0 ? "B" : "A"})`,
    );

  return {
    overallDelta,
    dimensionDeltas,
    winner,
    summary:
      largestDifferences.length === 0
        ? base
        : `${base} The largest dimension differences are ${largestDifferences.join(" and ")}.`,
  };
}
