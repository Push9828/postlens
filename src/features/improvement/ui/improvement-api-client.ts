import { z } from "zod";
import type { EvaluatePostResult } from "../../evaluation/application/evaluate-post";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
} from "../../evaluation/application/evaluate-post.limits";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import type { ImprovementResult } from "../application/improve-post";
import {
  IMPROVEMENT_ERRORS,
  type ImprovementErrorCode,
} from "../application/improvement-error";
import {
  IMPROVEMENT_ACTIONS,
  type ImprovementAction,
} from "../domain/improvement";

const successSchema = z.discriminatedUnion("status", [
  z.strictObject({
    improvementId: z.string().uuid(),
    status: z.literal("suggested"),
    action: z.enum(IMPROVEMENT_ACTIONS),
    revisedText: z.string().min(1).max(6_000),
    focusDimensions: z.array(z.enum(EVALUATION_DIMENSIONS)).min(1).max(2),
    target: z.enum(["hook", "ending"]).optional(),
    changeNote: z.string().min(1).max(240),
    reviewRequired: z.literal(true),
  }),
  z.strictObject({
    improvementId: z.string().uuid(),
    status: z.literal("no-safe-change"),
    action: z.enum(IMPROVEMENT_ACTIONS),
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

export class ImprovementClientError extends Error {
  override readonly name = "ImprovementClientError";
  constructor(
    readonly kind: "server" | "network" | "invalid-response" | "aborted",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export async function requestImprovement(
  content: string,
  action: ImprovementAction,
  evaluationResult: EvaluatePostResult,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<ImprovementResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/improvements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        content,
        action,
        evaluationId: evaluationResult.evaluationId,
        evaluation: evaluationResult.evaluation,
      }),
    });
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw new ImprovementClientError(
        "aborted",
        "The request was cancelled.",
        false,
      );
    throw new ImprovementClientError(
      "network",
      "Could not reach the improvement service. Check your connection and try again.",
      true,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ImprovementClientError(
      "invalid-response",
      "Could not read the improvement response. Please try again.",
      true,
    );
  }
  if (response.ok) {
    const parsed = successSchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.action !== action ||
      (parsed.data.status === "suggested" &&
        countUnicodeCodePoints(parsed.data.revisedText) > MAX_POST_CHARACTERS)
    )
      throw new ImprovementClientError(
        "invalid-response",
        "Could not read the improvement response. Please try again.",
        true,
      );
    return parsed.data satisfies ImprovementResult;
  }
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success)
    throw new ImprovementClientError(
      "invalid-response",
      "Could not read the improvement response. Please try again.",
      true,
    );
  throw new ImprovementClientError(
    "server",
    parsed.data.error.message,
    parsed.data.error.retryable,
  );
}
