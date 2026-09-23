import { describe, expect, it } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
  type PostJudgments,
} from "./evaluation.types";
import { POSTLENS_RUBRIC, type RubricDefinition } from "./rubric";
import {
  getNormalizedScore,
  getScoreInterpretation,
  ScoringInputError,
  scorePost,
} from "./scoring";

function createJudgments(
  levels: Partial<Record<EvaluationDimension, EvaluationLevel>> = {},
): PostJudgments {
  return {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        {
          level: levels[dimension] ?? 2,
          explanation: `${dimension} explanation`,
          confidence: 0.8,
        },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "educational",
    summary: "A test post summary.",
  };
}

function createRubricWithHookWeight(hookWeight: number): RubricDefinition {
  return {
    ...POSTLENS_RUBRIC,
    version: "rounding-test",
    dimensions: {
      ...POSTLENS_RUBRIC.dimensions,
      hook: {
        ...POSTLENS_RUBRIC.dimensions.hook,
        weight: hookWeight,
      },
      specificity: {
        ...POSTLENS_RUBRIC.dimensions.specificity,
        weight: 1 - hookWeight,
      },
      novelty: { ...POSTLENS_RUBRIC.dimensions.novelty, weight: 0 },
      clarity: { ...POSTLENS_RUBRIC.dimensions.clarity, weight: 0 },
      discussionPotential: {
        ...POSTLENS_RUBRIC.dimensions.discussionPotential,
        weight: 0,
      },
      credibility: { ...POSTLENS_RUBRIC.dimensions.credibility, weight: 0 },
      skimmability: {
        ...POSTLENS_RUBRIC.dimensions.skimmability,
        weight: 0,
      },
      emotionalResonance: {
        ...POSTLENS_RUBRIC.dimensions.emotionalResonance,
        weight: 0,
      },
    },
  };
}

describe("getNormalizedScore", () => {
  it.each([
    [0, 0],
    [1, 25],
    [2, 50],
    [3, 75],
    [4, 100],
  ] as const)("maps level %i to %i", (level, score) => {
    expect(getNormalizedScore(level)).toBe(score);
  });

  it("rejects an invalid semantic level", () => {
    expect(() => getNormalizedScore(5 as EvaluationLevel)).toThrow(
      ScoringInputError,
    );
  });
});

describe("getScoreInterpretation", () => {
  it.each([
    [0, "needs-substantial-work"],
    [39, "needs-substantial-work"],
    [40, "developing"],
    [59, "developing"],
    [60, "solid"],
    [74, "solid"],
    [75, "strong"],
    [89, "strong"],
    [90, "exceptional"],
    [100, "exceptional"],
  ] as const)("classifies %i as %s", (score, id) => {
    expect(getScoreInterpretation(score).id).toBe(id);
  });

  it.each([
    -1,
    100.1,
    101,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid score %s", (score) => {
    expect(() => getScoreInterpretation(score)).toThrow(ScoringInputError);
  });
});

describe("scorePost", () => {
  it("scores an all-zero evaluation", () => {
    const evaluation = scorePost(
      createJudgments(
        Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [dimension, 0]),
        ),
      ),
    );

    expect(evaluation.overallScore).toBe(0);
    expect(evaluation.scoreInterpretation.id).toBe("needs-substantial-work");
  });

  it("scores an all-four evaluation", () => {
    const evaluation = scorePost(
      createJudgments(
        Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [dimension, 4]),
        ),
      ),
    );

    expect(evaluation.overallScore).toBe(100);
    expect(evaluation.scoreInterpretation.id).toBe("exceptional");
  });

  it("calculates a manually verified weighted score", () => {
    const evaluation = scorePost(
      createJudgments({
        hook: 4,
        specificity: 3,
        novelty: 2,
        clarity: 1,
        discussionPotential: 4,
        credibility: 3,
        skimmability: 2,
        emotionalResonance: 1,
      }),
    );

    expect(evaluation.overallScore).toBe(67);
    expect(evaluation.scoreInterpretation.id).toBe("solid");
    expect(evaluation.strongestDimension).toBe("hook");
    expect(evaluation.weakestDimension).toBe("clarity");
  });

  it.each([
    [0.1796, 4],
    [0.18, 5],
    [0.1804, 5],
  ] as const)("rounds a weighted score using hook weight %f", (weight, score) => {
    const evaluation = scorePost(
      createJudgments({ hook: 1, specificity: 0 }),
      createRubricWithHookWeight(weight),
    );

    expect(evaluation.overallScore).toBe(score);
  });

  it("resolves equal strongest and weakest scores by canonical order", () => {
    const evaluation = scorePost(createJudgments());

    expect(evaluation.strongestDimension).toBe("hook");
    expect(evaluation.weakestDimension).toBe("hook");
  });

  it("preserves judgment data and rubric identity without mutating input", () => {
    const judgments = createJudgments({ hook: 3 });
    const original = structuredClone(judgments);
    const first = scorePost(judgments);
    const second = scorePost(judgments);

    expect(first).toEqual(second);
    expect(judgments).toEqual(original);
    expect(first.rubric).toEqual({
      id: "postlens-linkedin",
      version: "1.0.0",
    });
    expect(first.contentType).toBe(judgments.contentType);
    expect(first.summary).toBe(judgments.summary);
    expect(first.dimensions.hook).toEqual({
      ...judgments.dimensions.hook,
      score: 75,
    });
  });

  it("rejects a missing dimension", () => {
    const judgments = createJudgments();
    const { hook: _, ...incompleteDimensions } = judgments.dimensions;
    const incomplete = {
      ...judgments,
      dimensions: incompleteDimensions,
    } as PostJudgments;

    expect(() => scorePost(incomplete)).toThrow("Missing judgment for hook");
  });

  it("rejects rubric weights that do not total one", () => {
    const invalidRubric: RubricDefinition = {
      ...POSTLENS_RUBRIC,
      dimensions: {
        ...POSTLENS_RUBRIC.dimensions,
        hook: {
          ...POSTLENS_RUBRIC.dimensions.hook,
          weight: 0.2,
        },
      },
    };

    expect(() => scorePost(createJudgments(), invalidRubric)).toThrow(
      "Rubric weights must total 1",
    );
  });
});
