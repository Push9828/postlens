import { describe, expect, it, vi } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  type PostJudgments,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import { EvaluatePostService } from "./evaluate-post";
import { mapPostEvaluatorError } from "./evaluate-post.errors";
import type {
  EvaluationEvent,
  EvaluationObserver,
} from "./evaluation-observer";
import {
  type PostEvaluator,
  PostEvaluatorError,
  type PostEvaluatorErrorKind,
} from "./post-evaluator";

const PRIVATE_DRAFT = "This is private draft content with enough characters.";

function createJudgments(level: EvaluationLevel = 3): PostJudgments {
  return {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level, explanation: `${dimension} explanation` },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "educational",
    summary: "A safe summary.",
  };
}

class RecordingObserver implements EvaluationObserver {
  readonly events: EvaluationEvent[] = [];

  observe(event: EvaluationEvent): void {
    this.events.push(event);
  }
}

describe("EvaluatePostService", () => {
  it("normalizes, evaluates once, scores, and records separate timings", async () => {
    const evaluate = vi.fn(async () => createJudgments());
    const observer = new RecordingObserver();
    const times = [0, 10, 35, 50];
    const service = new EvaluatePostService({
      evaluator: { evaluate },
      evaluatorId: "fixture",
      observe: observer,
      now: () => times.shift() ?? 50,
      createEvaluationId: () => "evaluation-1",
    });

    const result = await service.execute({ content: `  ${PRIVATE_DRAFT}\n` });

    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledWith({ content: PRIVATE_DRAFT });
    expect(result).toEqual({
      evaluationId: "evaluation-1",
      evaluation: scorePost(createJudgments()),
    });
    expect(observer.events).toHaveLength(1);
    expect(observer.events[0]).toMatchObject({
      type: "evaluation.succeeded",
      evaluationId: "evaluation-1",
      evaluatorId: "fixture",
      evaluatorDurationMs: 25,
      totalDurationMs: 50,
      overallScore: 75,
    });
    expect(JSON.stringify(observer.events)).not.toContain(PRIVATE_DRAFT);
  });

  it("rejects invalid input before calling the evaluator", async () => {
    const evaluate = vi.fn(async () => createJudgments());
    const observer = new RecordingObserver();
    const service = new EvaluatePostService({
      evaluator: { evaluate },
      evaluatorId: "fixture",
      observe: observer,
      createEvaluationId: () => "evaluation-validation",
    });

    await expect(service.execute({ content: "short" })).rejects.toMatchObject({
      code: "POST_TOO_SHORT",
      evaluationId: "evaluation-validation",
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(observer.events[0]).toMatchObject({
      type: "evaluation.failed",
      errorCode: "POST_TOO_SHORT",
    });
  });

  it("maps evaluator failures and emits only safe metadata", async () => {
    const observer = new RecordingObserver();
    const evaluator: PostEvaluator = {
      evaluate: async () => {
        throw new PostEvaluatorError(
          "timeout",
          "provider secret and request body",
        );
      },
    };
    const service = new EvaluatePostService({
      evaluator,
      evaluatorId: "fixture",
      observe: observer,
      createEvaluationId: () => "evaluation-timeout",
    });

    await expect(
      service.execute({ content: PRIVATE_DRAFT }),
    ).rejects.toMatchObject({
      code: "EVALUATION_TIMEOUT",
      retryable: true,
      evaluationId: "evaluation-timeout",
    });
    const serialized = JSON.stringify(observer.events);
    expect(serialized).not.toContain(PRIVATE_DRAFT);
    expect(serialized).not.toContain("provider secret");
  });

  it("maps a scoring invariant failure to an internal error", async () => {
    const valid = createJudgments();
    const { hook: _hook, ...dimensions } = valid.dimensions;
    const invalid = { ...valid, dimensions };
    const service = new EvaluatePostService({
      evaluator: {
        evaluate: async () => invalid as PostJudgments,
      },
      evaluatorId: "fixture",
      createEvaluationId: () => "evaluation-scoring",
    });

    await expect(
      service.execute({ content: PRIVATE_DRAFT }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: false,
      evaluationId: "evaluation-scoring",
    });
  });

  it("does not let an observer failure change a successful result", async () => {
    const service = new EvaluatePostService({
      evaluator: { evaluate: async () => createJudgments() },
      evaluatorId: "fixture",
      observe: {
        observe: () => {
          throw new Error("telemetry unavailable");
        },
      },
      createEvaluationId: () => "evaluation-observer",
    });

    await expect(
      service.execute({ content: PRIVATE_DRAFT }),
    ).resolves.toMatchObject({ evaluationId: "evaluation-observer" });
  });
});

describe("mapPostEvaluatorError", () => {
  it.each<[PostEvaluatorErrorKind, string, boolean]>([
    ["configuration", "EVALUATION_UNAVAILABLE", false],
    ["authentication", "EVALUATION_UNAVAILABLE", false],
    ["timeout", "EVALUATION_TIMEOUT", true],
    ["rate-limit", "EVALUATION_BUSY", true],
    ["unavailable", "EVALUATION_UNAVAILABLE", true],
    ["invalid-response", "EVALUATION_FAILED", true],
    ["aborted", "EVALUATION_FAILED", true],
    ["unexpected", "INTERNAL_ERROR", false],
  ])("maps %s to %s", (kind, code, retryable) => {
    expect(
      mapPostEvaluatorError(new PostEvaluatorError(kind, "secret")),
    ).toMatchObject({ code, retryable });
  });
});
