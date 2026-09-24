import { z } from "zod";
import type { V2ComparePostsResult } from "../compare-posts";
import {
  v2EvaluationErrorResponseSchema,
  v2EvaluationSchema,
} from "../evaluation.schema";
import { isConsistentV2Evaluation } from "../resolve-evaluation";

const side = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("success"),
    evaluationId: z.uuid(),
    evaluation: v2EvaluationSchema,
  }),
  z.strictObject({
    status: z.literal("failure"),
    error: v2EvaluationErrorResponseSchema.shape.error,
  }),
]);
const resultSchema = z.strictObject({
  comparisonId: z.uuid(),
  status: z.enum(["complete", "partial", "failed"]),
  rubricVersion: z.literal("2.0"),
  versions: z.strictObject({ A: side, B: side }),
  comparison: z
    .strictObject({
      profileSource: z.literal("A"),
      originalQuality: z.number().finite().min(0).max(100),
      revisedQuality: z.number().finite().min(0).max(100),
      qualityDelta: z.number().finite().min(-100).max(100),
      winner: z.enum(["A", "B", "tie"]),
    })
    .optional(),
});
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: v2EvaluationErrorResponseSchema.shape.error.shape.code,
    message: z.string().min(1),
    retryable: z.boolean(),
    comparisonId: z.uuid(),
    field: z.enum(["A", "B"]).optional(),
  }),
});

export class V2ComparisonClientError extends Error {
  override readonly name = "V2ComparisonClientError";
  constructor(
    readonly kind: "server" | "network" | "invalid-response" | "aborted",
    message: string,
    readonly retryable: boolean,
    readonly field?: "A" | "B",
  ) {
    super(message);
  }
}

export async function requestV2Comparison(
  versionA: string,
  versionB: string,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<V2ComparePostsResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/v2/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionA, versionB }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbort(error))
      throw new V2ComparisonClientError(
        "aborted",
        "Comparison cancelled.",
        false,
      );
    throw new V2ComparisonClientError(
      "network",
      "Could not reach the evaluator. Try again.",
      true,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw invalidResponse();
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) throw invalidResponse();
    throw new V2ComparisonClientError(
      "server",
      parsed.data.error.message,
      parsed.data.error.retryable,
      parsed.data.error.field,
    );
  }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) throw invalidResponse();
  const { A, B } = parsed.data.versions;
  if (
    (A.status === "success" &&
      (!isConsistentV2Evaluation(A.evaluation) ||
        A.evaluation.resolvedProfile.source === "user-override")) ||
    (B.status === "success" &&
      (!isConsistentV2Evaluation(B.evaluation) ||
        B.evaluation.resolvedProfile.source === "user-override"))
  )
    throw invalidResponse();
  if (parsed.data.status === "complete") {
    if (
      A.status !== "success" ||
      B.status !== "success" ||
      !parsed.data.comparison
    )
      throw invalidResponse();
    const { comparison } = parsed.data;
    const original = A.evaluation.scores.contentQuality;
    const revised = scoreUnderA(
      B.evaluation.dimensionScores,
      A.evaluation.resolvedProfile,
    );
    const delta = revised - original;
    if (
      Math.abs(comparison.originalQuality - original) > 1e-8 ||
      Math.abs(comparison.revisedQuality - revised) > 1e-8 ||
      Math.abs(comparison.qualityDelta - delta) > 1e-8 ||
      comparison.winner !==
        (Math.abs(delta) < 1e-8 ? "tie" : delta > 0 ? "B" : "A")
    )
      throw invalidResponse();
    return parsed.data as V2ComparePostsResult;
  }
  if (
    parsed.data.comparison ||
    (parsed.data.status === "failed"
      ? A.status !== "failure" || B.status !== "failure"
      : A.status === B.status)
  )
    throw invalidResponse();
  return parsed.data as V2ComparePostsResult;
}

import { calculatePostScores } from "../scoring";
import type { DimensionScores, ResolvedWeightProfile } from "../types";

function scoreUnderA(
  scores: DimensionScores,
  profile: ResolvedWeightProfile,
): number {
  return calculatePostScores(scores, profile).contentQuality;
}
function invalidResponse() {
  return new V2ComparisonClientError(
    "invalid-response",
    "Could not read the comparison response. Try again.",
    true,
  );
}
function isAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
