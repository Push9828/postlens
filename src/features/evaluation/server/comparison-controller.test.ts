import { describe, expect, it, vi } from "vitest";
import {
  ComparePostsError,
  type ComparePostsResult,
} from "../application/compare-posts";
import { EvaluatePostError } from "../application/evaluate-post.errors";
import { handleComparisonRequest } from "./comparison-controller";

const draft = "A synthetic post draft with enough characters for evaluation.";

function request(body: string, contentType = "application/json") {
  return new Request("http://localhost/api/comparisons", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

describe("handleComparisonRequest", () => {
  it("returns a safe field error without caching", async () => {
    const response = await handleComparisonRequest(
      request(JSON.stringify({ versionA: draft, versionB: "short" })),
      {
        execute: async () => {
          throw new ComparePostsError("POST_TOO_SHORT", "comparison-1", "B");
        },
      },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "POST_TOO_SHORT",
        field: "B",
        comparisonId: "comparison-1",
      },
    });
  });

  it("returns partial results with HTTP 200 and complete failure with non-2xx", async () => {
    const sideFailure = {
      status: "failure" as const,
      error: {
        code: "EVALUATION_TIMEOUT" as const,
        message: "The evaluation took too long. Please try again.",
        retryable: true,
        evaluationId: "evaluation-b",
      },
    };
    const sideSuccess = {
      status: "success" as const,
      evaluationId: "evaluation-a",
      evaluation: {} as never,
    };
    const partial = {
      comparisonId: "comparison-1",
      status: "partial" as const,
      versions: { A: sideSuccess, B: sideFailure },
    } satisfies ComparePostsResult;
    const failed = {
      comparisonId: "comparison-1",
      status: "failed" as const,
      versions: { A: sideFailure, B: sideFailure },
    } satisfies ComparePostsResult;

    const partialResponse = await handleComparisonRequest(request("{}"), {
      execute: async () => partial,
    });
    const failedResponse = await handleComparisonRequest(request("{}"), {
      execute: async () => failed,
    });
    expect(partialResponse.status).toBe(200);
    expect(failedResponse.status).toBe(504);
    expect(await failedResponse.json()).toEqual(failed);
  });

  it("maps missing provider configuration to a controlled 503", async () => {
    const factory = vi.fn(() => {
      throw new EvaluatePostError("EVALUATION_UNAVAILABLE", false);
    });
    const response = await handleComparisonRequest(request("{}"), factory);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "EVALUATION_UNAVAILABLE", retryable: false },
    });
  });

  it("rejects invalid JSON and media types before resolving the service", async () => {
    const factory = vi.fn();
    expect((await handleComparisonRequest(request("{"), factory)).status).toBe(
      400,
    );
    expect(
      (await handleComparisonRequest(request("{}", "text/plain"), factory))
        .status,
    ).toBe(415);
    expect(factory).not.toHaveBeenCalled();
  });
});
