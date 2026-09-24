import { z } from "zod";
import type { V2EvaluatePostResult } from "../../../evaluation/v2/evaluate-post";
import { EVALUATION_DIMENSIONS } from "../../../evaluation/v2/types";
import {
  IMPROVEMENT_ERRORS,
  type ImprovementErrorCode,
} from "../../application/improvement-error";
import type { V2ImprovementResult } from "../improve-post";

const dimensionDeltas = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((key) => [
      key,
      z.number().int().min(-100).max(100),
    ]),
  ) as Record<(typeof EVALUATION_DIMENSIONS)[number], z.ZodNumber>,
);
const resultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    improvementId: z.uuid(),
    status: z.literal("suggested"),
    revisedText: z.string().min(1).max(6_000),
    changeNote: z.string().min(1).max(240),
    reviewRequired: z.literal(true),
    verification: z.strictObject({
      rubricVersion: z.literal("2.0"),
      originalQuality: z.number().finite().min(0).max(100),
      revisedQuality: z.number().finite().min(0).max(100),
      qualityDelta: z.number().finite().min(3).max(100),
      originalEngagement: z.number().finite().min(0).max(100),
      revisedEngagement: z.number().finite().min(0).max(100),
      engagementDelta: z.number().finite().min(-10).max(100),
      dimensionDeltas,
    }),
  }),
  z.strictObject({
    improvementId: z.uuid(),
    status: z.literal("no-safe-change"),
    reason: z.string().min(1).max(240),
  }),
]);
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(
      Object.keys(IMPROVEMENT_ERRORS) as [
        ImprovementErrorCode,
        ...ImprovementErrorCode[],
      ],
    ),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export class V2ImprovementClientError extends Error {
  override readonly name = "V2ImprovementClientError";
  constructor(
    readonly kind: "server" | "network" | "invalid-response" | "aborted",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
export async function requestV2Improvement(
  content: string,
  evaluationResult: V2EvaluatePostResult,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<V2ImprovementResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/v2/improvements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        content,
        action: "whole-post",
        evaluationId: evaluationResult.evaluationId,
        evaluation: evaluationResult.evaluation,
      }),
    });
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw new V2ImprovementClientError(
        "aborted",
        "The request was cancelled.",
        false,
      );
    throw new V2ImprovementClientError(
      "network",
      "Could not reach the improvement service. Try again.",
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
    throw new V2ImprovementClientError(
      "server",
      parsed.data.error.message,
      parsed.data.error.retryable,
    );
  }
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) throw invalidResponse();
  if (parsed.data.status === "suggested") {
    const v = parsed.data.verification;
    if (
      Math.abs(v.revisedQuality - v.originalQuality - v.qualityDelta) > 1e-8 ||
      Math.abs(v.revisedEngagement - v.originalEngagement - v.engagementDelta) >
        1e-8
    )
      throw invalidResponse();
  }
  return parsed.data satisfies V2ImprovementResult;
}
function invalidResponse() {
  return new V2ImprovementClientError(
    "invalid-response",
    "Could not read the improvement response. Try again.",
    true,
  );
}
