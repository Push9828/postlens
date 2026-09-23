import { z } from "zod";
import type { EvaluatePostResult } from "../application/evaluate-post";
import type { EvaluatePostErrorCode } from "../application/evaluate-post.errors";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
} from "../domain/evaluation.types";

const dimensionScoreSchema = z.union([
  z.literal(0),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]);

const dimensionEvaluationSchema = z.strictObject({
  level: z.union(EVALUATION_LEVELS.map((level) => z.literal(level))),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  score: dimensionScoreSchema,
});

const dimensionShape = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((dimension) => [
    dimension,
    dimensionEvaluationSchema,
  ]),
) as Record<
  (typeof EVALUATION_DIMENSIONS)[number],
  typeof dimensionEvaluationSchema
>;

const evaluationDimensionSchema = z.enum(EVALUATION_DIMENSIONS);
const contentTypeSchema = z.enum(CONTENT_TYPES);

const postEvaluationSchema = z.strictObject({
  rubric: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  overallScore: z.number().int().min(0).max(100),
  scoreInterpretation: z.strictObject({
    id: z.enum([
      "needs-substantial-work",
      "developing",
      "solid",
      "strong",
      "exceptional",
    ]),
    label: z.string().min(1),
    minimumScore: z.number().int().min(0).max(100),
    maximumScore: z.number().int().min(0).max(100),
  }),
  dimensions: z.strictObject(dimensionShape),
  strongestDimension: evaluationDimensionSchema,
  weakestDimension: evaluationDimensionSchema,
  contentType: contentTypeSchema,
  summary: z.string().min(1),
});

const successResponseSchema = z.strictObject({
  evaluationId: z.string().uuid(),
  evaluation: postEvaluationSchema,
});

const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "POST_TOO_SHORT",
  "POST_TOO_LONG",
  "UNSUPPORTED_MEDIA_TYPE",
  "EVALUATION_TIMEOUT",
  "EVALUATION_BUSY",
  "EVALUATION_UNAVAILABLE",
  "EVALUATION_FAILED",
  "INTERNAL_ERROR",
]);

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    evaluationId: z.string().uuid(),
  }),
});

export type EvaluationClientErrorKind =
  | "server"
  | "network"
  | "invalid-response"
  | "aborted";

export class EvaluationClientError extends Error {
  override readonly name = "EvaluationClientError";

  constructor(
    readonly kind: EvaluationClientErrorKind,
    message: string,
    readonly retryable: boolean,
    readonly code?: EvaluatePostErrorCode,
    readonly evaluationId?: string,
  ) {
    super(message);
  }
}

interface RequestPostEvaluationOptions {
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

export async function requestPostEvaluation(
  content: string,
  options: RequestPostEvaluationOptions = {},
): Promise<EvaluatePostResult> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw new EvaluationClientError(
        "aborted",
        "The evaluation was cancelled.",
        false,
      );
    }

    throw new EvaluationClientError(
      "network",
      "We could not reach the evaluator. Check your connection and try again.",
      true,
    );
  }

  const body = await readJson(response, options.signal);

  if (response.ok) {
    const result = successResponseSchema.safeParse(body);

    if (result.success) {
      return result.data satisfies EvaluatePostResult;
    }

    throw invalidResponseError();
  }

  const result = errorResponseSchema.safeParse(body);

  if (!result.success) {
    throw invalidResponseError();
  }

  throw new EvaluationClientError(
    "server",
    result.data.error.message,
    result.data.error.retryable,
    result.data.error.code,
    result.data.error.evaluationId,
  );
}

async function readJson(
  response: Response,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new EvaluationClientError(
        "aborted",
        "The evaluation was cancelled.",
        false,
      );
    }

    throw invalidResponseError();
  }
}

function invalidResponseError(): EvaluationClientError {
  return new EvaluationClientError(
    "invalid-response",
    "We could not read the evaluation response. Please try again.",
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
