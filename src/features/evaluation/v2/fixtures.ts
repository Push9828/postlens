import { vi } from "vitest";
import { V2EvaluatePostService } from "./evaluate-post";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  type RawPostEvaluation,
} from "./types";

const content = "A synthetic post with enough detail to evaluate safely.";

export async function v2Fixture(
  levels: Partial<
    Record<(typeof EVALUATION_DIMENSIONS)[number], EvaluationLevel>
  > = {},
  type: "educational" | "opinion" | "case-study" = "educational",
) {
  const rawEvaluation: RawPostEvaluation = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: levels[dimension] ?? 2, explanation: "Fixture judgment." },
      ]),
    ) as RawPostEvaluation["dimensions"],
  };
  const evaluate = vi.fn(async () => ({
    classification: {
      primaryType: type,
      confidence: 0.9,
      reasoning: "Fixture purpose.",
    },
    rawEvaluation,
  }));
  const result = await new V2EvaluatePostService({
    evaluator: { evaluate },
    evaluatorId: "fixture",
    createEvaluationId: () => "3c55ef5b-1bc5-40c2-b332-c24ac8854533",
  }).execute({ content });
  return { result, evaluate };
}
