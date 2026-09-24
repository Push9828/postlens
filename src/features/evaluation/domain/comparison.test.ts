import { describe, expect, it } from "vitest";
import { ComparisonInputError, compareEvaluations } from "./comparison";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
  type PostJudgments,
} from "./evaluation.types";
import { scorePost } from "./scoring";

function evaluation(
  levels: Partial<Record<EvaluationDimension, EvaluationLevel>> = {},
) {
  const judgments: PostJudgments = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: levels[dimension] ?? 2, explanation: `${dimension} fixture` },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "educational",
    summary: "Fixture summary.",
  };
  return scorePost(judgments);
}

describe("compareEvaluations", () => {
  it("calculates signed B-minus-A deltas and a rubric-scoped summary", () => {
    const A = evaluation();
    const B = evaluation({ hook: 3, clarity: 3 });
    const result = compareEvaluations(A, B);

    expect(result.overallDelta).toBe(B.overallScore - A.overallScore);
    expect(result.dimensionDeltas.hook).toBe(25);
    expect(result.dimensionDeltas.clarity).toBe(25);
    expect(result.dimensionDeltas.novelty).toBe(0);
    expect(result.winner).toBe("B");
    expect(result.summary).toContain("against the current PostLens rubric");
    expect(result.summary).toContain("Hook (25 for B) and Clarity (25 for B)");
  });

  it("keeps equal overall scores tied even when dimensions differ", () => {
    const A = evaluation({ specificity: 3, novelty: 2 });
    const B = evaluation({ specificity: 2, novelty: 3 });
    const result = compareEvaluations(A, B);

    expect(result.overallDelta).toBe(0);
    expect(result.winner).toBe("tie");
    expect(result.dimensionDeltas.specificity).toBe(-25);
    expect(result.dimensionDeltas.novelty).toBe(25);
    expect(result.summary).toContain("same Post Potential");
  });

  it("rejects a different rubric version", () => {
    const A = evaluation();
    const B = { ...evaluation(), rubric: { ...A.rubric, version: "2.0.0" } };
    expect(() => compareEvaluations(A, B)).toThrow(ComparisonInputError);
  });
});
