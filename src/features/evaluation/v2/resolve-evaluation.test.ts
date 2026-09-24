import { describe, expect, it } from "vitest";
import { v2Fixture } from "./fixtures";
import {
  isConsistentV2Evaluation,
  withPostTypeOverride,
} from "./resolve-evaluation";

describe("V2 post type override", () => {
  it("reweights unchanged raw observations without an evaluator call", async () => {
    const { result, evaluate } = await v2Fixture(
      { novelty: 0, clarity: 4 },
      "educational",
    );
    const before = result.evaluation;
    const after = withPostTypeOverride(before, "opinion");
    expect(evaluate).toHaveBeenCalledOnce();
    expect(after.rawEvaluation).toBe(before.rawEvaluation);
    expect(after.dimensionScores).toEqual(before.dimensionScores);
    expect(after.detectedClassification).toEqual(before.detectedClassification);
    expect(after.resolvedProfile).toMatchObject({
      source: "user-override",
      resolvedPostType: "opinion",
    });
    expect(after.scores.contentQuality).not.toBe(before.scores.contentQuality);
    expect(isConsistentV2Evaluation(after)).toBe(true);
  });

  it("rejects inconsistent weights and scores", async () => {
    const { result } = await v2Fixture();
    expect(
      isConsistentV2Evaluation({
        ...result.evaluation,
        scores: { ...result.evaluation.scores, contentQuality: 95 },
      }),
    ).toBe(false);
  });
});
