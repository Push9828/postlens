import { z } from "zod";
import {
  ComparisonInputError,
  compareEvaluations,
  type PostComparison,
} from "../domain/comparison";
import type { EvaluatePostResult } from "./evaluate-post";
import {
  EvaluatePostError,
  type EvaluatePostErrorCode,
} from "./evaluate-post.errors";
import { countUnicodeCodePoints } from "./evaluate-post.limits";
import { parseEvaluatePostInput } from "./evaluate-post.schema";

const compareRequestSchema = z.strictObject({
  versionA: z.string(),
  versionB: z.string(),
});

export type ComparisonField = "A" | "B";

export class ComparePostsError extends Error {
  override readonly name = "ComparePostsError";

  constructor(
    readonly code: EvaluatePostErrorCode,
    readonly comparisonId: string,
    readonly field?: ComparisonField,
    readonly retryable: boolean = new EvaluatePostError(code).retryable,
  ) {
    super(new EvaluatePostError(code).message);
  }
}

export interface ComparisonSuccess {
  readonly status: "success";
  readonly evaluationId: string;
  readonly evaluation: EvaluatePostResult["evaluation"];
}

export interface ComparisonFailure {
  readonly status: "failure";
  readonly error: {
    readonly code: EvaluatePostErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly evaluationId: string;
  };
}

export type ComparisonSide = ComparisonSuccess | ComparisonFailure;

export type ComparePostsResult =
  | {
      readonly comparisonId: string;
      readonly status: "complete";
      readonly versions: {
        readonly A: ComparisonSuccess;
        readonly B: ComparisonSuccess;
      };
      readonly comparison: PostComparison;
    }
  | {
      readonly comparisonId: string;
      readonly status: "partial";
      readonly versions:
        | { readonly A: ComparisonSuccess; readonly B: ComparisonFailure }
        | { readonly A: ComparisonFailure; readonly B: ComparisonSuccess };
    }
  | {
      readonly comparisonId: string;
      readonly status: "failed";
      readonly versions: {
        readonly A: ComparisonFailure;
        readonly B: ComparisonFailure;
      };
    };

export interface ComparisonEvent {
  readonly type: "comparison.completed" | "comparison.rejected";
  readonly comparisonId: string;
  readonly timestamp: string;
  readonly totalDurationMs: number;
  readonly characterCounts?: { readonly A: number; readonly B: number };
  readonly status?: ComparePostsResult["status"];
  readonly rubric?: { readonly id: string; readonly version: string };
  readonly versions?: {
    readonly A: {
      readonly evaluationId: string;
      readonly score?: number;
      readonly errorCode?: EvaluatePostErrorCode;
    };
    readonly B: {
      readonly evaluationId: string;
      readonly score?: number;
      readonly errorCode?: EvaluatePostErrorCode;
    };
  };
  readonly errorCode?: EvaluatePostErrorCode;
  readonly field?: ComparisonField;
}

interface EvaluationService {
  execute(input: unknown): Promise<EvaluatePostResult>;
}

export interface ComparePostsServiceOptions {
  readonly evaluationService: EvaluationService;
  readonly observe?: (event: ComparisonEvent) => void;
  readonly now?: () => number;
  readonly createComparisonId?: () => string;
}

export class ComparePostsService {
  private readonly evaluationService: EvaluationService;
  private readonly observe?: (event: ComparisonEvent) => void;
  private readonly now: () => number;
  private readonly createComparisonId: () => string;

  constructor(options: ComparePostsServiceOptions) {
    this.evaluationService = options.evaluationService;
    this.observe = options.observe;
    this.now = options.now ?? (() => performance.now());
    this.createComparisonId =
      options.createComparisonId ?? (() => crypto.randomUUID());
  }

  async execute(input: unknown): Promise<ComparePostsResult> {
    const comparisonId = this.createComparisonId();
    const startedAt = this.now();
    try {
      const request = compareRequestSchema.safeParse(input);
      if (!request.success) {
        throw new ComparePostsError("INVALID_REQUEST", comparisonId);
      }

      const versionA = parseSide(request.data.versionA, "A", comparisonId);
      const versionB = parseSide(request.data.versionB, "B", comparisonId);
      const characterCounts = {
        A: countUnicodeCodePoints(versionA),
        B: countUnicodeCodePoints(versionB),
      };
      const [outcomeA, outcomeB] = await Promise.allSettled([
        this.evaluationService.execute({ content: versionA }),
        this.evaluationService.execute({ content: versionB }),
      ]);
      const A = toSide(outcomeA);
      const B = toSide(outcomeB);
      let result: ComparePostsResult;

      if (A.status === "success" && B.status === "success") {
        try {
          result = {
            comparisonId,
            status: "complete",
            versions: { A, B },
            comparison: compareEvaluations(A.evaluation, B.evaluation),
          };
        } catch (error) {
          if (error instanceof ComparisonInputError) {
            throw new ComparePostsError("INTERNAL_ERROR", comparisonId);
          }
          throw error;
        }
      } else if (A.status === "failure" && B.status === "failure") {
        result = { comparisonId, status: "failed", versions: { A, B } };
      } else if (A.status === "success" && B.status === "failure") {
        result = { comparisonId, status: "partial", versions: { A, B } };
      } else if (A.status === "failure" && B.status === "success") {
        result = { comparisonId, status: "partial", versions: { A, B } };
      } else {
        throw new ComparePostsError("INTERNAL_ERROR", comparisonId);
      }

      this.notify({
        type: "comparison.completed",
        comparisonId,
        timestamp: new Date().toISOString(),
        totalDurationMs: Math.max(0, this.now() - startedAt),
        characterCounts,
        status: result.status,
        ...(A.status === "success"
          ? { rubric: A.evaluation.rubric }
          : B.status === "success"
            ? { rubric: B.evaluation.rubric }
            : {}),
        versions: { A: eventSide(A), B: eventSide(B) },
      });
      return result;
    } catch (error) {
      const safeError =
        error instanceof ComparePostsError
          ? error
          : new ComparePostsError("INTERNAL_ERROR", comparisonId);
      this.notify({
        type: "comparison.rejected",
        comparisonId,
        timestamp: new Date().toISOString(),
        totalDurationMs: Math.max(0, this.now() - startedAt),
        errorCode: safeError.code,
        ...(safeError.field === undefined ? {} : { field: safeError.field }),
      });
      throw safeError;
    }
  }

  private notify(event: ComparisonEvent): void {
    try {
      this.observe?.(event);
    } catch {
      // Reporting must not change the result.
    }
  }
}

function parseSide(
  content: string,
  field: ComparisonField,
  comparisonId: string,
): string {
  try {
    return parseEvaluatePostInput({ content }).content;
  } catch (error) {
    if (error instanceof EvaluatePostError) {
      throw new ComparePostsError(error.code, comparisonId, field);
    }
    throw error;
  }
}

function toSide(
  outcome: PromiseSettledResult<EvaluatePostResult>,
): ComparisonSide {
  if (outcome.status === "fulfilled") {
    return { status: "success", ...outcome.value };
  }
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

function eventSide(side: ComparisonSide) {
  return side.status === "success"
    ? { evaluationId: side.evaluationId, score: side.evaluation.overallScore }
    : { evaluationId: side.error.evaluationId, errorCode: side.error.code };
}
