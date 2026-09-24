import { describe, expect, it, vi } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type PostJudgments,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import { ComparePostsService } from "./compare-posts";
import { EvaluatePostError } from "./evaluate-post.errors";

const A = "Version A is a private synthetic draft with enough characters.";
const B =
  "Version B is another private synthetic draft with enough characters.";
const evaluation = scorePost({
  dimensions: Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      { level: 2, explanation: "Fixture explanation." },
    ]),
  ) as PostJudgments["dimensions"],
  contentType: "educational",
  summary: "Fixture summary.",
});

describe("ComparePostsService", () => {
  it("validates both drafts before evaluating either and attributes field errors", async () => {
    const execute = vi.fn();
    const service = new ComparePostsService({
      evaluationService: { execute },
      createComparisonId: () => "comparison-1",
    });

    await expect(
      service.execute({ versionA: A, versionB: "short" }),
    ).rejects.toMatchObject({
      code: "POST_TOO_SHORT",
      field: "B",
      comparisonId: "comparison-1",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("starts both evaluations before either settles and excludes draft text from telemetry", async () => {
    const resolvers: Array<
      (value: { evaluationId: string; evaluation: typeof evaluation }) => void
    > = [];
    const execute = vi.fn(
      () =>
        new Promise<{ evaluationId: string; evaluation: typeof evaluation }>(
          (resolve) => resolvers.push(resolve),
        ),
    );
    const events: unknown[] = [];
    const service = new ComparePostsService({
      evaluationService: { execute },
      observe: (event) => events.push(event),
      createComparisonId: () => "comparison-2",
    });

    const pending = service.execute({ versionA: ` ${A} `, versionB: B });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, { content: A });
    expect(execute).toHaveBeenNthCalledWith(2, { content: B });
    resolvers[1]({ evaluationId: "evaluation-b", evaluation });
    resolvers[0]({ evaluationId: "evaluation-a", evaluation });
    const result = await pending;

    expect(result.status).toBe("complete");
    if (result.status === "complete")
      expect(result.comparison.winner).toBe("tie");
    expect(JSON.stringify(result)).not.toContain(A);
    expect(JSON.stringify(result)).not.toContain(B);
    expect(JSON.stringify(events)).not.toContain(A);
    expect(JSON.stringify(events)).not.toContain(B);
  });

  it("returns a partial result without comparison when one side fails", async () => {
    const service = new ComparePostsService({
      evaluationService: {
        execute: async (input) => {
          if (JSON.stringify(input).includes("Version B")) {
            throw new EvaluatePostError(
              "EVALUATION_TIMEOUT",
              true,
              "evaluation-b",
            );
          }
          return { evaluationId: "evaluation-a", evaluation };
        },
      },
    });
    const result = await service.execute({ versionA: A, versionB: B });

    expect(result.status).toBe("partial");
    expect(result).not.toHaveProperty("comparison");
    expect(result.versions.B).toMatchObject({
      status: "failure",
      error: { code: "EVALUATION_TIMEOUT" },
    });
  });

  it("returns both safe failures when both evaluations fail", async () => {
    const service = new ComparePostsService({
      evaluationService: {
        execute: async () => {
          throw new Error("provider secret");
        },
      },
    });
    const result = await service.execute({ versionA: A, versionB: B });

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("provider secret");
    expect(result.versions.A).toMatchObject({
      status: "failure",
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
