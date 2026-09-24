import { describe, expect, it, vi } from "vitest";
import { V2EvaluatePostService } from "./evaluate-post";
import { V2JevEvaluatorError } from "./jev/jev-error";
import { EVALUATION_DIMENSIONS, type RawPostEvaluation } from "./types";

const PRIVATE_DRAFT = "A private draft with enough detail to evaluate.";
const EVALUATION_ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";
const rawEvaluation: RawPostEvaluation = {
  dimensions: Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      { level: 3, explanation: "Strong enough for this fixture." },
    ]),
  ) as RawPostEvaluation["dimensions"],
};

describe("V2EvaluatePostService", () => {
  it("keeps judgments and deterministic results separate", async () => {
    const evaluate = vi.fn(async () => ({
      classification: {
        primaryType: "case-study" as const,
        secondaryType: "educational" as const,
        confidence: 0.68,
        reasoning: "A concrete problem and outcome anchor the post.",
      },
      rawEvaluation,
    }));
    const observe = vi.fn();
    const service = new V2EvaluatePostService({
      evaluator: { evaluate },
      evaluatorId: "fixture",
      observe,
      createEvaluationId: () => EVALUATION_ID,
    });
    const result = await service.execute({ content: PRIVATE_DRAFT });

    expect(evaluate).toHaveBeenCalledExactlyOnceWith(PRIVATE_DRAFT);
    expect(result.evaluation).toMatchObject({
      rubricVersion: "2.0",
      detectedClassification: {
        primaryType: "case-study",
        secondaryType: "educational",
      },
      rawEvaluation,
      dimensionScores: { hook: 75, clarity: 75 },
      resolvedProfile: { source: "ai-blended", resolvedPostType: "case-study" },
    });
    expect(
      result.evaluation.resolvedProfile.qualityWeights.clarity,
    ).toBeCloseTo(21.2);
    expect(result.evaluation.scores.contentQuality).toBeCloseTo(75);
    expect(result.evaluation.scores.engagementPotential).toBeCloseTo(75);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "evaluation.v2.succeeded",
        rubricVersion: "2.0",
        primaryPostType: "case-study",
        secondaryPostType: "educational",
        classificationConfidence: 0.68,
        resolutionSource: "ai-blended",
      }),
    );
    expect(JSON.stringify(observe.mock.calls)).not.toContain(PRIVATE_DRAFT);
  });

  it("rejects invalid input before calling Jev", async () => {
    const evaluate = vi.fn();
    const service = new V2EvaluatePostService({
      evaluator: { evaluate },
      evaluatorId: "fixture",
    });
    await expect(service.execute({ content: "short" })).rejects.toMatchObject({
      code: "POST_TOO_SHORT",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("maps provider failure to a safe application error and event", async () => {
    const observe = vi.fn();
    const service = new V2EvaluatePostService({
      evaluator: {
        evaluate: async () => {
          throw new V2JevEvaluatorError("timeout", PRIVATE_DRAFT);
        },
      },
      evaluatorId: "fixture",
      observe,
      createEvaluationId: () => EVALUATION_ID,
    });
    const error = await service
      .execute({ content: PRIVATE_DRAFT })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "EVALUATION_TIMEOUT",
      evaluationId: EVALUATION_ID,
    });
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DRAFT);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "evaluation.v2.failed",
        errorCode: "EVALUATION_TIMEOUT",
        rubricVersion: "2.0",
      }),
    );
    expect(JSON.stringify(observe.mock.calls)).not.toContain(PRIVATE_DRAFT);
  });
});
