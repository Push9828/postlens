import { describe, expect, it } from "vitest";
import { GENERIC_PROFILE, POST_TYPE_PROFILES } from "./profiles";
import { NORMALIZED_SCORE_BY_LEVEL, POSTLENS_RUBRIC_V2 } from "./rubric";
import {
  blendWeights,
  calculatePostScores,
  calculateScore,
  resolveWeightProfile,
  roundPostScores,
  scoreRawDimensions,
  V2ScoringInputError,
  validateWeights,
} from "./scoring";
import {
  type DimensionScores,
  type DimensionWeights,
  EVALUATION_DIMENSIONS,
  POST_TYPES,
  type PostTypeClassification,
  type RawPostEvaluation,
  RUBRIC_VERSION,
} from "./types";

const baseClassification: PostTypeClassification = {
  primaryType: "case-study",
  secondaryType: "educational",
  confidence: 0.68,
  reasoning: "A concrete problem and resolution teach a reusable lesson.",
};

function scores(value: number): DimensionScores {
  return Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, value]),
  ) as DimensionScores;
}

describe("Rubric V2 configuration", () => {
  it("defines eight types, nine shared dimensions, five levels, and version 2.0", () => {
    expect(POST_TYPES).toHaveLength(8);
    expect(new Set(POST_TYPES).size).toBe(8);
    expect(EVALUATION_DIMENSIONS).toHaveLength(9);
    expect(new Set(EVALUATION_DIMENSIONS).size).toBe(9);
    expect(POSTLENS_RUBRIC_V2.version).toBe(RUBRIC_VERSION);
    expect(RUBRIC_VERSION).toBe("2.0");
    expect(Object.keys(POSTLENS_RUBRIC_V2.dimensions)).toEqual([
      ...EVALUATION_DIMENSIONS,
    ]);
    expect(NORMALIZED_SCORE_BY_LEVEL).toEqual({
      0: 0,
      1: 25,
      2: 50,
      3: 75,
      4: 100,
    });
    for (const dimension of EVALUATION_DIMENSIONS) {
      const criterion = POSTLENS_RUBRIC_V2.dimensions[dimension];
      expect(criterion.label).not.toBe("");
      expect(criterion.question).not.toBe("");
      expect(Object.keys(criterion.levels)).toEqual(["0", "1", "2", "3", "4"]);
      expect(Object.values(criterion.levels).every(Boolean)).toBe(true);
    }
  });

  it("validates both sets of weights for every type and the generic fallback", () => {
    expect(Object.keys(POST_TYPE_PROFILES)).toEqual([...POST_TYPES]);
    for (const profile of [
      ...Object.values(POST_TYPE_PROFILES),
      GENERIC_PROFILE,
    ]) {
      expect(() => validateWeights(profile.qualityWeights)).not.toThrow();
      expect(() => validateWeights(profile.engagementWeights)).not.toThrow();
      expect(
        Object.values(profile.qualityWeights).reduce<number>(
          (sum, value) => sum + value,
          0,
        ),
      ).toBe(100);
      expect(
        Object.values(profile.engagementWeights).reduce<number>(
          (sum, value) => sum + value,
          0,
        ),
      ).toBe(100);
    }
  });

  it("rejects invalid or missing weights", () => {
    expect(() =>
      validateWeights({ ...GENERIC_PROFILE.qualityWeights, hook: -1 }),
    ).toThrow(V2ScoringInputError);
    expect(() =>
      validateWeights({ ...GENERIC_PROFILE.qualityWeights, hook: 6 }),
    ).toThrow(V2ScoringInputError);
    const { hook: _, ...missing } = GENERIC_PROFILE.qualityWeights;
    expect(() => validateWeights(missing as DimensionWeights)).toThrow(
      V2ScoringInputError,
    );
  });
});

describe("V2 profile resolution", () => {
  it("blends case study and educational weights 70/30 without losing the total", () => {
    const profile = resolveWeightProfile(baseClassification);
    expect(profile.source).toBe("ai-blended");
    expect(profile.resolvedPostType).toBe("case-study");
    expect(profile.secondaryType).toBe("educational");
    expect(profile.qualityWeights.clarity).toBeCloseTo(21.2, 10);
    expect(profile.engagementWeights.hook).toBeCloseTo(21.2, 10);
    expect(() => validateWeights(profile.qualityWeights)).not.toThrow();
    expect(() => validateWeights(profile.engagementWeights)).not.toThrow();
    expect(
      blendWeights(
        POST_TYPE_PROFILES["case-study"].qualityWeights,
        POST_TYPE_PROFILES.educational.qualityWeights,
      ),
    ).toEqual(profile.qualityWeights);
  });

  it.each([
    [0.9, "ai-primary"],
    [0.75, "ai-primary"],
    [0.74, "ai-blended"],
    [0.55, "ai-blended"],
    [0.54, "generic-fallback"],
  ] as const)("resolves confidence %s to %s", (confidence, source) => {
    expect(
      resolveWeightProfile({ ...baseClassification, confidence }).source,
    ).toBe(source);
  });

  it("uses primary when medium confidence has no distinct secondary", () => {
    expect(
      resolveWeightProfile({ ...baseClassification, secondaryType: undefined })
        .source,
    ).toBe("ai-primary");
    expect(
      resolveWeightProfile({
        ...baseClassification,
        secondaryType: "case-study",
      }).source,
    ).toBe("ai-primary");
  });

  it("uses a valid user override at 100% even when AI confidence is low", () => {
    const profile = resolveWeightProfile(
      { ...baseClassification, confidence: 0.3 },
      "story",
    );
    expect(profile.source).toBe("user-override");
    expect(profile.resolvedPostType).toBe("story");
    expect(profile.secondaryType).toBeUndefined();
    expect(profile.qualityWeights).toEqual(
      POST_TYPE_PROFILES.story.qualityWeights,
    );
    expect(profile.engagementWeights).toEqual(
      POST_TYPE_PROFILES.story.engagementWeights,
    );
  });

  it("rejects malformed confidence and override values", () => {
    expect(() =>
      resolveWeightProfile({ ...baseClassification, confidence: Number.NaN }),
    ).toThrow(V2ScoringInputError);
    expect(() =>
      resolveWeightProfile({ ...baseClassification, confidence: 1.1 }),
    ).toThrow(V2ScoringInputError);
    expect(() =>
      resolveWeightProfile(baseClassification, "other" as never),
    ).toThrow(V2ScoringInputError);
  });
});

describe("V2 scoring", () => {
  it("maps raw judgments to scores without using the weight profile", () => {
    const raw: RawPostEvaluation = {
      dimensions: Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension, index) => [
          dimension,
          { level: (index % 5) as 0 | 1 | 2 | 3 | 4, explanation: "Evidence" },
        ]),
      ) as RawPostEvaluation["dimensions"],
    };
    const mapped = scoreRawDimensions(raw);
    expect(mapped.hook).toBe(0);
    expect(mapped.clarity).toBe(25);
    expect(mapped.novelty).toBe(100);
    expect(mapped.conversationPotential).toBe(75);
  });

  it("calculates both scores deterministically and rounds only when requested", () => {
    const dimensionScores = { ...scores(75), hook: 25, novelty: 50 };
    const first = calculatePostScores(
      dimensionScores,
      POST_TYPE_PROFILES.educational,
    );
    const second = calculatePostScores(
      dimensionScores,
      POST_TYPE_PROFILES.educational,
    );
    expect(first).toEqual(second);
    expect(first.contentQuality).toBeCloseTo(71.25, 10);
    expect(first.engagementPotential).toBeCloseTo(61, 10);
    expect(roundPostScores(first)).toEqual({
      contentQuality: 71,
      engagementPotential: 61,
    });
    expect(
      calculateScore(scores(75), POST_TYPE_PROFILES.story.qualityWeights),
    ).toBeCloseTo(75, 10);
  });

  it("caps low clarity at 65 and low credibility at 60 without capping engagement", () => {
    const clarityLow = { ...scores(100), clarity: 25 };
    const credibilityLow = { ...scores(100), credibility: 25 };
    const bothLow = { ...clarityLow, credibility: 25 };
    expect(
      calculatePostScores(clarityLow, POST_TYPE_PROFILES.educational)
        .contentQuality,
    ).toBe(65);
    expect(
      calculatePostScores(credibilityLow, POST_TYPE_PROFILES.educational)
        .contentQuality,
    ).toBe(60);
    const both = calculatePostScores(bothLow, POST_TYPE_PROFILES.educational);
    expect(both.contentQuality).toBe(60);
    expect(both.engagementPotential).toBe(100);
  });

  it("rejects invalid raw levels and dimension scores", () => {
    const raw = {
      dimensions: Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          dimension,
          { level: 2, explanation: "Evidence" },
        ]),
      ) as RawPostEvaluation["dimensions"],
    };
    expect(() =>
      scoreRawDimensions({
        dimensions: {
          ...raw.dimensions,
          hook: { level: 5 as never, explanation: "Invalid" },
        },
      }),
    ).toThrow(V2ScoringInputError);
    expect(() =>
      calculateScore(
        { ...scores(50), hook: Number.NaN },
        GENERIC_PROFILE.qualityWeights,
      ),
    ).toThrow(V2ScoringInputError);
  });
});
