import { describe, expect, it, vi } from "vitest";
import { EvaluatePostError } from "../application";
import {
  EVALUATION_DIMENSIONS,
  type PostJudgments,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import { handleEvaluationRequest } from "./evaluation-controller";

const PRIVATE_DRAFT = "A private draft that is long enough to evaluate.";

function request(body: string, contentType = "application/json"): Request {
  return new Request("http://localhost/api/evaluations", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

function createEvaluation() {
  const judgments: PostJudgments = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: 2, explanation: "fixture" },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "educational",
    summary: "Fixture summary.",
  };

  return scorePost(judgments);
}

describe("handleEvaluationRequest", () => {
  it("returns the exact success envelope without caching", async () => {
    const execute = vi.fn(async () => ({
      evaluationId: "evaluation-success",
      evaluation: createEvaluation(),
    }));
    const response = await handleEvaluationRequest(
      request(
        JSON.stringify({ content: PRIVATE_DRAFT }),
        "application/json; charset=utf-8",
      ),
      { execute },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      evaluationId: "evaluation-success",
      evaluation: createEvaluation(),
    });
    expect(execute).toHaveBeenCalledWith({ content: PRIVATE_DRAFT });
  });

  it("rejects unsupported content types before resolving the service", async () => {
    const factory = vi.fn();
    const response = await handleEvaluationRequest(
      request(JSON.stringify({ content: PRIVATE_DRAFT }), "text/plain"),
      factory,
    );

    expect(response.status).toBe(415);
    expect(factory).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE", retryable: false },
    });
  });

  it("rejects invalid JSON before resolving the service", async () => {
    const factory = vi.fn();
    const response = await handleEvaluationRequest(request("{"), factory);

    expect(response.status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it.each([
    ["INVALID_REQUEST", 400, false],
    ["POST_TOO_SHORT", 400, false],
    ["POST_TOO_LONG", 400, false],
    ["EVALUATION_TIMEOUT", 504, true],
    ["EVALUATION_BUSY", 429, true],
    ["EVALUATION_UNAVAILABLE", 503, true],
    ["EVALUATION_FAILED", 502, true],
    ["INTERNAL_ERROR", 500, false],
  ] as const)("maps %s to HTTP %i", async (code, status, retryable) => {
    const response = await handleEvaluationRequest(
      request(JSON.stringify({ content: PRIVATE_DRAFT })),
      {
        execute: async () => {
          throw new EvaluatePostError(code, retryable, "evaluation-error");
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      error: { code, retryable, evaluationId: "evaluation-error" },
    });
    expect(JSON.stringify(body)).not.toContain(PRIVATE_DRAFT);
  });

  it("returns a generic 500 for unknown failures", async () => {
    const response = await handleEvaluationRequest(
      request(JSON.stringify({ content: PRIVATE_DRAFT })),
      {
        execute: async () => {
          throw new Error("raw provider failure");
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      error: { code: "INTERNAL_ERROR", retryable: false },
    });
    expect(JSON.stringify(body)).not.toContain("raw provider failure");
  });

  it("turns lazy configuration failure into a controlled 503", async () => {
    const response = await handleEvaluationRequest(
      request(JSON.stringify({ content: PRIVATE_DRAFT })),
      () => {
        throw new EvaluatePostError("EVALUATION_UNAVAILABLE", false);
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "EVALUATION_UNAVAILABLE", retryable: false },
    });
  });
});
