import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
  type EvaluationDimension,
  type EvaluationLevel,
  NORMALIZED_SCORE_BY_LEVEL,
  POSTLENS_RUBRIC,
  type PostJudgments,
} from ".";

describe("evaluation domain", () => {
  it("defines the eight dimensions once in canonical order", () => {
    expect(EVALUATION_DIMENSIONS).toHaveLength(8);
    expect(new Set(EVALUATION_DIMENSIONS)).toHaveLength(8);
    expect(EVALUATION_DIMENSIONS).toEqual([
      "hook",
      "specificity",
      "novelty",
      "clarity",
      "discussionPotential",
      "credibility",
      "skimmability",
      "emotionalResonance",
    ]);
  });

  it("defines the content types from the product specification", () => {
    expect(CONTENT_TYPES).toEqual([
      "educational",
      "story",
      "opinion",
      "case-study",
      "reflection",
      "announcement",
      "build-in-public",
      "other",
    ]);
  });

  it("requires a judgment for every dimension", () => {
    expectTypeOf<PostJudgments["dimensions"]>().toEqualTypeOf<
      Readonly<
        Record<
          EvaluationDimension,
          PostJudgments["dimensions"][EvaluationDimension]
        >
      >
    >();
  });
});

describe("PostLens rubric", () => {
  it("is explicitly identified and versioned", () => {
    expect(POSTLENS_RUBRIC.id).toBe("postlens-linkedin");
    expect(POSTLENS_RUBRIC.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("defines exactly one rubric entry for every dimension", () => {
    expect(Object.keys(POSTLENS_RUBRIC.dimensions)).toEqual([
      ...EVALUATION_DIMENSIONS,
    ]);
  });

  it("defines meaningful text and all five levels for every dimension", () => {
    for (const dimension of EVALUATION_DIMENSIONS) {
      const definition = POSTLENS_RUBRIC.dimensions[dimension];

      expect(definition.label.trim()).not.toBe("");
      expect(definition.question.trim()).not.toBe("");
      expect(Object.keys(definition.levels).map(Number)).toEqual([
        ...EVALUATION_LEVELS,
      ]);

      for (const level of EVALUATION_LEVELS) {
        expect(definition.levels[level].trim()).not.toBe("");
      }
    }
  });

  it("uses the PRD weights and totals one", () => {
    const weights = EVALUATION_DIMENSIONS.map(
      (dimension) => POSTLENS_RUBRIC.dimensions[dimension].weight,
    );

    expect(weights).toEqual([0.18, 0.14, 0.14, 0.12, 0.14, 0.1, 0.1, 0.08]);
    expect(weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(
      1,
      10,
    );
  });

  it("maps every semantic level to its normalized score", () => {
    expect(NORMALIZED_SCORE_BY_LEVEL).toEqual({
      0: 0,
      1: 25,
      2: 50,
      3: 75,
      4: 100,
    });

    const scores = EVALUATION_LEVELS.map(
      (level) => NORMALIZED_SCORE_BY_LEVEL[level],
    );
    expect(scores).toEqual([...scores].toSorted((left, right) => left - right));
    expectTypeOf(NORMALIZED_SCORE_BY_LEVEL).toMatchTypeOf<
      Readonly<Record<EvaluationLevel, number>>
    >();
  });
});
