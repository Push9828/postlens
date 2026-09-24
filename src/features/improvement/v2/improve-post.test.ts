import { describe, expect, it, vi } from "vitest";
import { v2Fixture } from "../../evaluation/v2/fixtures";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
} from "../../evaluation/v2/types";
import { passesV2ImprovementGate, V2ImprovePostService } from "./improve-post";

const original =
  "A synthetic draft with one concrete problem and a clear lesson.";
const revised =
  "A synthetic draft with one concrete problem, a tested action, and a clear lesson.";
const deltas = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((dimension) => [
    dimension,
    dimension === "specificity" ? 25 : 0,
  ]),
) as Record<EvaluationDimension, number>;

describe("V2 improvement gate", () => {
  it("requires quality gain, focus gain, balanced dimensions, and engagement preservation", () => {
    const base = {
      qualityDelta: 5,
      engagementDelta: 0,
      dimensionDeltas: deltas,
      focus: ["specificity" as const],
    };
    expect(passesV2ImprovementGate(base)).toBe(true);
    expect(passesV2ImprovementGate({ ...base, qualityDelta: 2.99 })).toBe(
      false,
    );
    expect(passesV2ImprovementGate({ ...base, focus: ["hook"] })).toBe(false);
    expect(passesV2ImprovementGate({ ...base, engagementDelta: -10.01 })).toBe(
      false,
    );
    expect(passesV2ImprovementGate({ ...base, engagementDelta: -10 })).toBe(
      true,
    );
    expect(
      passesV2ImprovementGate({
        ...base,
        dimensionDeltas: { ...deltas, hook: -25, clarity: -25 },
      }),
    ).toBe(false);
    expect(
      passesV2ImprovementGate({
        ...base,
        dimensionDeltas: { ...deltas, hook: -50 },
      }),
    ).toBe(false);
  });

  it("verifies a revision under the original snapshot profile", async () => {
    const snapshot = (await v2Fixture({ specificity: 0 }, "case-study")).result;
    const first = (await v2Fixture({ specificity: 0 }, "opinion")).result;
    const second = (await v2Fixture({ specificity: 1 }, "educational")).result;
    const evaluate = vi.fn(async (input: unknown) =>
      (input as { content: string }).content === original ? first : second,
    );
    const generator = {
      improve: vi.fn(async () => ({
        status: "suggested" as const,
        text: revised,
        changeNote: "Added concrete action.",
      })),
    };
    const result = await new V2ImprovePostService(generator, {
      execute: evaluate,
    }).execute({
      content: original,
      action: "whole-post",
      evaluationId: snapshot.evaluationId,
      evaluation: snapshot.evaluation,
    });
    expect(result.status).toBe("suggested");
    if (result.status !== "suggested") return;
    expect(result.verification.qualityDelta).toBeCloseTo(5);
    expect(result.verification.dimensionDeltas.specificity).toBe(25);
    expect(generator.improve).toHaveBeenCalledWith(
      expect.objectContaining({
        focus: expect.arrayContaining(["specificity"]),
      }),
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("rejects stale and inconsistent snapshots before generation", async () => {
    const snapshot = (await v2Fixture()).result;
    const generator = { improve: vi.fn() };
    const evaluator = { execute: vi.fn() };
    const service = new V2ImprovePostService(generator, evaluator);
    const request = {
      content: original,
      action: "whole-post",
      evaluationId: snapshot.evaluationId,
      evaluation: snapshot.evaluation,
    };
    await expect(
      service.execute({
        ...request,
        evaluation: { ...snapshot.evaluation, rubricVersion: "1.0.0" },
      }),
    ).rejects.toMatchObject({ code: "STALE_RUBRIC" });
    await expect(
      service.execute({
        ...request,
        evaluation: {
          ...snapshot.evaluation,
          scores: { ...snapshot.evaluation.scores, contentQuality: 99 },
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(generator.improve).not.toHaveBeenCalled();
    expect(evaluator.execute).not.toHaveBeenCalled();
  });
});
