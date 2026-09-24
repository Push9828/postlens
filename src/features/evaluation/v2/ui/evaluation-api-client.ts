import type { EvaluatePostErrorCode } from "../../application/evaluate-post.errors";
import type { V2EvaluatePostResult } from "../evaluate-post";
import {
  v2EvaluationErrorResponseSchema,
  v2EvaluationResponseSchema,
} from "../evaluation.schema";
import {
  calculatePostScores,
  resolveWeightProfile,
  scoreRawDimensions,
} from "../scoring";
import { EVALUATION_DIMENSIONS } from "../types";

export class V2EvaluationClientError extends Error {
  override readonly name = "V2EvaluationClientError";

  constructor(
    readonly kind: "server" | "network" | "invalid-response" | "aborted",
    message: string,
    readonly retryable: boolean,
    readonly code?: EvaluatePostErrorCode,
    readonly evaluationId?: string,
  ) {
    super(message);
  }
}

export async function requestV2PostEvaluation(
  content: string,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: typeof fetch;
  } = {},
): Promise<V2EvaluatePostResult> {
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("/api/v2/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbort(error))
      throw new V2EvaluationClientError(
        "aborted",
        "The evaluation was cancelled.",
        false,
      );
    throw new V2EvaluationClientError(
      "network",
      "We could not reach the evaluator. Check your connection and try again.",
      true,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted || isAbort(error))
      throw new V2EvaluationClientError(
        "aborted",
        "The evaluation was cancelled.",
        false,
      );
    throw invalidResponse();
  }

  if (!response.ok) {
    const parsedError = v2EvaluationErrorResponseSchema.safeParse(body);
    if (!parsedError.success) throw invalidResponse();
    throw new V2EvaluationClientError(
      "server",
      parsedError.data.error.message,
      parsedError.data.error.retryable,
      parsedError.data.error.code,
      parsedError.data.error.evaluationId,
    );
  }

  const parsed = v2EvaluationResponseSchema.safeParse(body);
  if (!parsed.success || !isConsistent(parsed.data.evaluation))
    throw invalidResponse();
  return parsed.data satisfies V2EvaluatePostResult;
}

function isConsistent(evaluation: V2EvaluatePostResult["evaluation"]): boolean {
  try {
    const dimensions = scoreRawDimensions(evaluation.rawEvaluation);
    if (
      EVALUATION_DIMENSIONS.some(
        (dimension) =>
          dimensions[dimension] !== evaluation.dimensionScores[dimension],
      )
    )
      return false;
    const profile = resolveWeightProfile(evaluation.detectedClassification);
    if (
      profile.source !== evaluation.resolvedProfile.source ||
      profile.resolvedPostType !==
        evaluation.resolvedProfile.resolvedPostType ||
      profile.secondaryType !== evaluation.resolvedProfile.secondaryType ||
      EVALUATION_DIMENSIONS.some(
        (dimension) =>
          Math.abs(
            profile.qualityWeights[dimension] -
              evaluation.resolvedProfile.qualityWeights[dimension],
          ) > 1e-8 ||
          Math.abs(
            profile.engagementWeights[dimension] -
              evaluation.resolvedProfile.engagementWeights[dimension],
          ) > 1e-8,
      )
    )
      return false;
    const scores = calculatePostScores(dimensions, profile);
    return (
      Math.abs(scores.contentQuality - evaluation.scores.contentQuality) <
        1e-8 &&
      Math.abs(
        scores.engagementPotential - evaluation.scores.engagementPotential,
      ) < 1e-8
    );
  } catch {
    return false;
  }
}

function invalidResponse(): V2EvaluationClientError {
  return new V2EvaluationClientError(
    "invalid-response",
    "We could not read the evaluation response. Please try again.",
    true,
  );
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
