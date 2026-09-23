import { describe, expect, it, vi } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type PostJudgments,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import {
  EvaluationClientError,
  requestPostEvaluation,
} from "./evaluation-api-client";

const EVALUATION_ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";
const PRIVATE_DRAFT = "Private draft content that must not enter errors.";

function createResult() {
  const judgments: PostJudgments = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: 3, explanation: `${dimension} explanation` },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "educational",
    summary: "Fixture summary.",
  };

  return {
    evaluationId: EVALUATION_ID,
    evaluation: scorePost(judgments),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("requestPostEvaluation", () => {
  it("sends the strict request and validates a successful response", async () => {
    const fetcher = vi.fn(async () => jsonResponse(createResult()));

    await expect(
      requestPostEvaluation(PRIVATE_DRAFT, {
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toEqual(createResult());

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: PRIVATE_DRAFT }),
      signal: undefined,
    });
  });

  it("maps a validated server error without provider details", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "EVALUATION_TIMEOUT",
            message: "The evaluation took too long. Please try again.",
            retryable: true,
            evaluationId: EVALUATION_ID,
          },
        },
        504,
      ),
    );

    const error = await requestPostEvaluation(PRIVATE_DRAFT, {
      fetcher: fetcher as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EvaluationClientError);
    expect(error).toMatchObject({
      kind: "server",
      code: "EVALUATION_TIMEOUT",
      retryable: true,
      evaluationId: EVALUATION_ID,
    });
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DRAFT);
  });

  it.each([
    jsonResponse({ unexpected: true }),
    jsonResponse({ ...createResult(), extra: true }),
    new Response("not json", { status: 502 }),
  ])("rejects malformed response bodies", async (response) => {
    const fetcher = vi.fn(async () => response.clone());

    await expect(
      requestPostEvaluation(PRIVATE_DRAFT, {
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: true,
    });
  });

  it("maps a network failure without copying its raw message", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`network failed with ${PRIVATE_DRAFT}`);
    });

    const error = await requestPostEvaluation(PRIVATE_DRAFT, {
      fetcher: fetcher as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind: "network", retryable: true });
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DRAFT);
  });

  it("maps an aborted request separately", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    });

    await expect(
      requestPostEvaluation(PRIVATE_DRAFT, {
        signal: controller.signal,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toMatchObject({
      kind: "aborted",
      retryable: false,
    });
  });
});
