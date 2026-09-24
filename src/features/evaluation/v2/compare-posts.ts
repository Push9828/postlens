import { z } from "zod";
import { EvaluatePostError } from "../application/evaluate-post.errors";
import { parseEvaluatePostInput } from "../application/evaluate-post.schema";
import type { V2EvaluatePostResult } from "./evaluate-post";
import { calculatePostScores } from "./scoring";
import { RUBRIC_VERSION } from "./types";

const requestSchema = z.strictObject({
  versionA: z.string(),
  versionB: z.string(),
});
export type V2ComparisonField = "A" | "B";

export class V2ComparisonError extends Error {
  override readonly name = "V2ComparisonError";
  constructor(
    readonly code: EvaluatePostError["code"],
    readonly comparisonId: string,
    readonly field?: V2ComparisonField,
  ) {
    super(new EvaluatePostError(code).message);
  }
}

export type V2ComparisonSide =
  | ({ readonly status: "success" } & V2EvaluatePostResult)
  | {
      readonly status: "failure";
      readonly error: {
        readonly code: EvaluatePostError["code"];
        readonly message: string;
        readonly retryable: boolean;
        readonly evaluationId: string;
      };
    };

export type V2ComparePostsResult =
  | {
      readonly comparisonId: string;
      readonly status: "complete";
      readonly rubricVersion: typeof RUBRIC_VERSION;
      readonly versions: {
        readonly A: Extract<V2ComparisonSide, { status: "success" }>;
        readonly B: Extract<V2ComparisonSide, { status: "success" }>;
      };
      readonly comparison: {
        readonly profileSource: "A";
        readonly originalQuality: number;
        readonly revisedQuality: number;
        readonly qualityDelta: number;
        readonly winner: "A" | "B" | "tie";
      };
    }
  | {
      readonly comparisonId: string;
      readonly status: "partial" | "failed";
      readonly rubricVersion: typeof RUBRIC_VERSION;
      readonly versions: {
        readonly A: V2ComparisonSide;
        readonly B: V2ComparisonSide;
      };
    };

export class V2ComparePostsService {
  constructor(
    private readonly evaluator: {
      execute(input: unknown): Promise<V2EvaluatePostResult>;
    },
    private readonly observe?: (event: Record<string, unknown>) => void,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: unknown): Promise<V2ComparePostsResult> {
    const comparisonId = this.createId();
    const startedAt = performance.now();
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success)
      throw new V2ComparisonError("INVALID_REQUEST", comparisonId);
    const A = parseSide(parsed.data.versionA, "A", comparisonId);
    const B = parseSide(parsed.data.versionB, "B", comparisonId);
    const [a, b] = await Promise.allSettled([
      this.evaluator.execute({ content: A }),
      this.evaluator.execute({ content: B }),
    ]);
    const sideA = toSide(a);
    const sideB = toSide(b);
    let result: V2ComparePostsResult;
    if (sideA.status === "success" && sideB.status === "success") {
      const profile = sideA.evaluation.resolvedProfile;
      const originalQuality = calculatePostScores(
        sideA.evaluation.dimensionScores,
        profile,
      ).contentQuality;
      const revisedQuality = calculatePostScores(
        sideB.evaluation.dimensionScores,
        profile,
      ).contentQuality;
      const qualityDelta = revisedQuality - originalQuality;
      result = {
        comparisonId,
        status: "complete",
        rubricVersion: RUBRIC_VERSION,
        versions: { A: sideA, B: sideB },
        comparison: {
          profileSource: "A",
          originalQuality,
          revisedQuality,
          qualityDelta,
          winner:
            Math.abs(qualityDelta) < 1e-8
              ? "tie"
              : qualityDelta > 0
                ? "B"
                : "A",
        },
      };
    } else {
      result = {
        comparisonId,
        status:
          sideA.status === "failure" && sideB.status === "failure"
            ? "failed"
            : "partial",
        rubricVersion: RUBRIC_VERSION,
        versions: { A: sideA, B: sideB },
      };
    }
    try {
      this.observe?.({
        type: "comparison.v2.completed",
        timestamp: new Date().toISOString(),
        comparisonId,
        rubricVersion: RUBRIC_VERSION,
        status: result.status,
        characterCounts: { A: Array.from(A).length, B: Array.from(B).length },
        totalDurationMs: Math.max(0, performance.now() - startedAt),
        A: eventSide(sideA),
        B: eventSide(sideB),
        ...(result.status === "complete"
          ? {
              qualityDelta: result.comparison.qualityDelta,
              winner: result.comparison.winner,
            }
          : {}),
      });
    } catch {
      // Reporting never changes a comparison.
    }
    return result;
  }
}

function parseSide(
  content: string,
  field: V2ComparisonField,
  id: string,
): string {
  try {
    return parseEvaluatePostInput({ content }).content;
  } catch (error) {
    if (error instanceof EvaluatePostError)
      throw new V2ComparisonError(error.code, id, field);
    throw error;
  }
}

function toSide(
  outcome: PromiseSettledResult<V2EvaluatePostResult>,
): V2ComparisonSide {
  if (outcome.status === "fulfilled")
    return { status: "success", ...outcome.value };
  const error =
    outcome.reason instanceof EvaluatePostError
      ? outcome.reason
      : new EvaluatePostError("INTERNAL_ERROR");
  return {
    status: "failure",
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      evaluationId: error.evaluationId ?? crypto.randomUUID(),
    },
  };
}

function eventSide(side: V2ComparisonSide) {
  return side.status === "success"
    ? {
        evaluationId: side.evaluationId,
        primaryPostType: side.evaluation.detectedClassification.primaryType,
        resolutionSource: side.evaluation.resolvedProfile.source,
        contentQuality: side.evaluation.scores.contentQuality,
        engagementPotential: side.evaluation.scores.engagementPotential,
      }
    : { evaluationId: side.error.evaluationId, errorCode: side.error.code };
}
