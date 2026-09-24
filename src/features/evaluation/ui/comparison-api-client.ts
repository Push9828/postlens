import { z } from "zod";
import type {
  ComparePostsResult,
  ComparisonField,
} from "../application/compare-posts";
import { EVALUATION_DIMENSIONS } from "../domain/evaluation.types";
import { errorCodeSchema, postEvaluationSchema } from "./evaluation-api-client";

const sideSuccessSchema = z.strictObject({
  status: z.literal("success"),
  evaluationId: z.string().uuid(),
  evaluation: postEvaluationSchema,
});

const sideFailureSchema = z.strictObject({
  status: z.literal("failure"),
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    evaluationId: z.string().uuid(),
  }),
});

const dimensionDeltasSchema = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      z.number().int().min(-100).max(100),
    ]),
  ) as Record<(typeof EVALUATION_DIMENSIONS)[number], z.ZodNumber>,
);

const comparisonSchema = z.strictObject({
  overallDelta: z.number().int().min(-100).max(100),
  dimensionDeltas: dimensionDeltasSchema,
  winner: z.enum(["A", "B", "tie"]),
  summary: z.string().min(1),
});

const resultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    comparisonId: z.string().uuid(),
    status: z.literal("complete"),
    versions: z.strictObject({ A: sideSuccessSchema, B: sideSuccessSchema }),
    comparison: comparisonSchema,
  }),
  z.strictObject({
    comparisonId: z.string().uuid(),
    status: z.literal("partial"),
    versions: z.union([
      z.strictObject({ A: sideSuccessSchema, B: sideFailureSchema }),
      z.strictObject({ A: sideFailureSchema, B: sideSuccessSchema }),
    ]),
  }),
  z.strictObject({
    comparisonId: z.string().uuid(),
    status: z.literal("failed"),
    versions: z.strictObject({ A: sideFailureSchema, B: sideFailureSchema }),
  }),
]);

const errorSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    comparisonId: z.string().uuid(),
    field: z.enum(["A", "B"]).optional(),
  }),
});

export class ComparisonClientError extends Error {
  override readonly name = "ComparisonClientError";

  constructor(
    readonly kind: "server" | "network" | "invalid-response" | "aborted",
    message: string,
    readonly retryable: boolean,
    readonly field?: ComparisonField,
  ) {
    super(message);
  }
}

export async function requestPostComparison(
  versionA: string,
  versionB: string,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<ComparePostsResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionA, versionB }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw new ComparisonClientError(
        "aborted",
        "Comparison cancelled.",
        false,
      );
    }
    throw new ComparisonClientError(
      "network",
      "We could not reach the evaluator. Check your connection and try again.",
      true,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw new ComparisonClientError(
        "aborted",
        "Comparison cancelled.",
        false,
      );
    }
    throw invalidResponse();
  }

  const result = resultSchema.safeParse(body);
  if (result.success) {
    if (
      (response.ok && result.data.status !== "failed") ||
      (!response.ok && result.data.status === "failed")
    ) {
      return result.data satisfies ComparePostsResult;
    }
    throw invalidResponse();
  }

  const error = errorSchema.safeParse(body);
  if (!response.ok && error.success) {
    throw new ComparisonClientError(
      "server",
      error.data.error.message,
      error.data.error.retryable,
      error.data.error.field,
    );
  }
  throw invalidResponse();
}

function invalidResponse(): ComparisonClientError {
  return new ComparisonClientError(
    "invalid-response",
    "We could not read the comparison response. Please try again.",
    true,
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
