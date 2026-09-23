import {
  type DimensionEvaluation,
  type DimensionScore,
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
  type PostEvaluation,
  type PostJudgments,
  type ScoreInterpretation,
} from "./evaluation.types";
import {
  NORMALIZED_SCORE_BY_LEVEL,
  POSTLENS_RUBRIC,
  type RubricDefinition,
} from "./rubric";

const WEIGHT_TOTAL_TOLERANCE = 1e-10;

export const SCORE_INTERPRETATIONS = [
  {
    id: "needs-substantial-work",
    label: "Needs substantial work",
    minimumScore: 0,
    maximumScore: 39,
  },
  {
    id: "developing",
    label: "Developing",
    minimumScore: 40,
    maximumScore: 59,
  },
  {
    id: "solid",
    label: "Solid",
    minimumScore: 60,
    maximumScore: 74,
  },
  {
    id: "strong",
    label: "Strong",
    minimumScore: 75,
    maximumScore: 89,
  },
  {
    id: "exceptional",
    label: "Exceptional against this rubric",
    minimumScore: 90,
    maximumScore: 100,
  },
] as const satisfies readonly ScoreInterpretation[];

export class ScoringInputError extends Error {
  override readonly name = "ScoringInputError";
}

export function getNormalizedScore(level: EvaluationLevel): DimensionScore {
  const score = NORMALIZED_SCORE_BY_LEVEL[level];

  if (score === undefined) {
    throw new ScoringInputError(`Invalid evaluation level: ${String(level)}`);
  }

  return score;
}

export function getScoreInterpretation(score: number): ScoreInterpretation {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new ScoringInputError(
      `Overall score must be an integer from 0 to 100; received ${String(score)}`,
    );
  }

  const interpretation = SCORE_INTERPRETATIONS.find(
    ({ minimumScore, maximumScore }) =>
      score >= minimumScore && score <= maximumScore,
  );

  if (interpretation === undefined) {
    throw new ScoringInputError(`No interpretation exists for score ${score}`);
  }

  return interpretation;
}

export function scorePost(
  judgments: PostJudgments,
  rubric: RubricDefinition = POSTLENS_RUBRIC,
): PostEvaluation {
  assertValidRubricWeights(rubric);

  const dimensionEntries = EVALUATION_DIMENSIONS.map((dimension) => {
    const judgment = judgments.dimensions[dimension];

    if (judgment === undefined) {
      throw new ScoringInputError(`Missing judgment for ${dimension}`);
    }

    const score = getNormalizedScore(judgment.level);

    return [dimension, { ...judgment, score }] as const;
  });

  const dimensions = Object.fromEntries(dimensionEntries) as Readonly<
    Record<EvaluationDimension, DimensionEvaluation>
  >;

  const weightedTotal = EVALUATION_DIMENSIONS.reduce(
    (total, dimension) =>
      total + dimensions[dimension].score * rubric.dimensions[dimension].weight,
    0,
  );
  const overallScore = Math.round(weightedTotal);

  return {
    rubric: {
      id: rubric.id,
      version: rubric.version,
    },
    overallScore,
    scoreInterpretation: getScoreInterpretation(overallScore),
    dimensions,
    strongestDimension: selectDimensionByScore(dimensions, "strongest"),
    weakestDimension: selectDimensionByScore(dimensions, "weakest"),
    contentType: judgments.contentType,
    summary: judgments.summary,
  };
}

function assertValidRubricWeights(rubric: RubricDefinition): void {
  const totalWeight = EVALUATION_DIMENSIONS.reduce((total, dimension) => {
    const definition = rubric.dimensions[dimension];

    if (definition === undefined) {
      throw new ScoringInputError(`Missing rubric definition for ${dimension}`);
    }

    if (!Number.isFinite(definition.weight) || definition.weight < 0) {
      throw new ScoringInputError(`Invalid rubric weight for ${dimension}`);
    }

    return total + definition.weight;
  }, 0);

  if (Math.abs(totalWeight - 1) > WEIGHT_TOTAL_TOLERANCE) {
    throw new ScoringInputError(
      `Rubric weights must total 1; received ${totalWeight}`,
    );
  }
}

function selectDimensionByScore(
  dimensions: Readonly<Record<EvaluationDimension, DimensionEvaluation>>,
  direction: "strongest" | "weakest",
): EvaluationDimension {
  return EVALUATION_DIMENSIONS.reduce((selected, candidate) => {
    const selectedScore = dimensions[selected].score;
    const candidateScore = dimensions[candidate].score;

    if (direction === "strongest" && candidateScore > selectedScore) {
      return candidate;
    }

    if (direction === "weakest" && candidateScore < selectedScore) {
      return candidate;
    }

    return selected;
  });
}
