import { describe, expect, it, vi } from "vitest";
import { V2EvaluatePostService } from "../evaluate-post";
import { EVALUATION_DIMENSIONS, type RawPostEvaluation } from "../types";
import { requestV2PostEvaluation } from "./evaluation-api-client";

const EVALUATION_ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";
const PRIVATE_DRAFT = "A private draft with enough detail to evaluate.";

async function fixture() {
  const rawEvaluation: RawPostEvaluation = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: 3, explanation: "Strong fixture evidence." },
      ]),
    ) as RawPostEvaluation["dimensions"],
  };
  return new V2EvaluatePostService({
    evaluator: {
      evaluate: async () => ({
        classification: {
          primaryType: "educational",
          confidence: 0.9,
          reasoning: "The post teaches a method.",
        },
        rawEvaluation,
      }),
    },
    evaluatorId: "fixture",
    createEvaluationId: () => EVALUATION_ID,
  }).execute({ content: PRIVATE_DRAFT });
}

describe("requestV2PostEvaluation", () => {
  it("accepts a valid V2 response", async () => {
    const result = await fixture();
    const fetcher = vi.fn(async () => Response.json(result));
    await expect(
      requestV2PostEvaluation(PRIVATE_DRAFT, {
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith("/api/v2/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: PRIVATE_DRAFT }),
      signal: undefined,
    });
  });

  it("rejects malformed and inconsistent success responses", async () => {
    const result = await fixture();
    for (const body of [
      { ...result, extra: true },
      { ...result, evaluation: { ...result.evaluation, overallScore: 75 } },
      {
        ...result,
        evaluation: {
          ...result.evaluation,
          scores: { ...result.evaluation.scores, contentQuality: 95 },
        },
      },
      {
        ...result,
        evaluation: {
          ...result.evaluation,
          resolvedProfile: {
            ...result.evaluation.resolvedProfile,
            source: "user-override",
          },
        },
      },
    ]) {
      await expect(
        requestV2PostEvaluation(PRIVATE_DRAFT, {
          fetcher: (async () => Response.json(body)) as typeof fetch,
        }),
      ).rejects.toMatchObject({ kind: "invalid-response" });
    }
  });

  it("validates errors and hides raw network messages", async () => {
    await expect(
      requestV2PostEvaluation(PRIVATE_DRAFT, {
        fetcher: (async () =>
          Response.json(
            {
              error: {
                code: "EVALUATION_TIMEOUT",
                message: "The evaluation took too long. Please try again.",
                retryable: true,
                evaluationId: EVALUATION_ID,
              },
            },
            { status: 504 },
          )) as typeof fetch,
      }),
    ).rejects.toMatchObject({
      kind: "server",
      code: "EVALUATION_TIMEOUT",
    });
    const error = await requestV2PostEvaluation(PRIVATE_DRAFT, {
      fetcher: (async () => {
        throw new Error(PRIVATE_DRAFT);
      }) as typeof fetch,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "network" });
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DRAFT);
  });
});
