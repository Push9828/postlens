import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import { z } from "zod";
import type { PostEvaluator } from "../../application/post-evaluator";
import {
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
  type EvaluatePostInput,
  type EvaluationDimension,
  type EvaluationLevel,
  type PostJudgments,
} from "../../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../../domain/rubric";
import {
  JevAdapterError,
  type JevDecisionClient,
  type JevDiagnosticsObserver,
  type JevDimensionDiagnostics,
  type JevEvaluationDiagnostics,
  type JevExplanationMode,
} from "./jev.types";
import { getReasonDefinition } from "./jev-reasons";
import {
  type ParsedJevDimensionAnswer,
  type ParsedJevResponse,
  parseJevResponse,
} from "./jev-response";

export interface JevPostEvaluatorOptions {
  readonly client: JevDecisionClient;
  readonly requestedModel?: string;
  readonly explanationMode?: JevExplanationMode;
  readonly onDiagnostics?: JevDiagnosticsObserver;
}

export class JevPostEvaluator implements PostEvaluator {
  private readonly client: JevDecisionClient;
  private readonly requestedModel: string;
  private readonly explanationMode: JevExplanationMode;
  private readonly onDiagnostics?: JevDiagnosticsObserver;

  constructor(options: JevPostEvaluatorOptions) {
    this.client = options.client;
    this.requestedModel = options.requestedModel ?? "jev-latest";
    this.explanationMode = options.explanationMode ?? "reason-code";
    this.onDiagnostics = options.onDiagnostics;
  }

  async evaluate(input: EvaluatePostInput): Promise<PostJudgments> {
    const startedAt = performance.now();
    let response: ParsedJevResponse;

    try {
      const rawResponse = await this.client.evaluate({
        content: input.content,
        explanationMode: this.explanationMode,
      });
      response = parseJevResponse(rawResponse, this.explanationMode);
    } catch (error) {
      throw mapJevError(error);
    }

    const latencyMs = performance.now() - startedAt;
    const levels = mapSelectedLevels(response);
    const dimensions = Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => {
        const answer = response.dimensions[dimension];
        const level = levels[dimension];

        return [
          dimension,
          {
            level,
            confidence: answer.confidence,
            explanation: getExplanation(
              dimension,
              level,
              answer,
              this.explanationMode,
            ),
          },
        ] as const;
      }),
    ) as PostJudgments["dimensions"];

    const diagnostics = createDiagnostics(
      response,
      levels,
      latencyMs,
      this.requestedModel,
      this.explanationMode,
    );
    notifyDiagnostics(this.onDiagnostics, diagnostics);

    return {
      dimensions,
      contentType: response.contentType,
      summary: createSummary(levels, response.contentType),
    };
  }
}

export function selectJevLevel(
  probabilities: Readonly<Record<EvaluationLevel, number>>,
): EvaluationLevel {
  return EVALUATION_LEVELS.reduce((selected, candidate) =>
    probabilities[candidate] > probabilities[selected] ? candidate : selected,
  );
}

function mapSelectedLevels(
  response: ParsedJevResponse,
): Readonly<Record<EvaluationDimension, EvaluationLevel>> {
  return Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      selectJevLevel(response.dimensions[dimension].probabilities),
    ]),
  ) as Readonly<Record<EvaluationDimension, EvaluationLevel>>;
}

function getExplanation(
  dimension: EvaluationDimension,
  level: EvaluationLevel,
  answer: ParsedJevDimensionAnswer,
  mode: JevExplanationMode,
): string {
  if (mode === "reason-code" && answer.reason !== undefined) {
    const reason = getReasonDefinition(dimension, answer.reason.code);

    if (reason?.compatibleLevels.some((compatible) => compatible === level)) {
      return reason.explanation;
    }
  }

  return POSTLENS_RUBRIC.dimensions[dimension].levels[level];
}

function createSummary(
  levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>,
  contentType: PostJudgments["contentType"],
): string {
  const strongest = selectDimension(levels, "strongest");
  const weakest = selectDimension(levels, "weakest");

  return `This ${contentType} draft is strongest in ${POSTLENS_RUBRIC.dimensions[strongest].label} and weakest in ${POSTLENS_RUBRIC.dimensions[weakest].label} against the current rubric.`;
}

function selectDimension(
  levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>,
  direction: "strongest" | "weakest",
): EvaluationDimension {
  return EVALUATION_DIMENSIONS.reduce((selected, candidate) => {
    if (direction === "strongest" && levels[candidate] > levels[selected]) {
      return candidate;
    }

    if (direction === "weakest" && levels[candidate] < levels[selected]) {
      return candidate;
    }

    return selected;
  });
}

function createDiagnostics(
  response: ParsedJevResponse,
  levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>,
  latencyMs: number,
  requestedModel: string,
  explanationMode: JevExplanationMode,
): JevEvaluationDiagnostics {
  const dimensions = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => {
      const answer = response.dimensions[dimension];
      const diagnostic: JevDimensionDiagnostics = {
        selectedLevel: levels[dimension],
        expectedScore: answer.expectedScore,
        confidence: answer.confidence,
        probabilities: answer.probabilities,
        ...(answer.reason === undefined
          ? {}
          : {
              reasonCode: answer.reason.code,
              reasonConfidence: answer.reason.confidence,
            }),
      };

      return [dimension, diagnostic] as const;
    }),
  ) as JevEvaluationDiagnostics["dimensions"];

  return {
    provider: "jev",
    requestedModel,
    resolvedModel: response.model,
    rubric: {
      id: POSTLENS_RUBRIC.id,
      version: POSTLENS_RUBRIC.version,
    },
    explanationMode,
    latencyMs,
    usage: response.usage,
    dimensions,
    contentType: response.contentType,
    contentTypeConfidence: response.contentTypeConfidence,
  };
}

function notifyDiagnostics(
  observer: JevDiagnosticsObserver | undefined,
  diagnostics: JevEvaluationDiagnostics,
): void {
  if (observer === undefined) {
    return;
  }

  observer(diagnostics);
}

function mapJevError(error: unknown): JevAdapterError {
  if (error instanceof JevAdapterError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new JevAdapterError(
      "malformed-response",
      "Jev returned a response that does not match the expected schema.",
    );
  }

  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  ) {
    return createProviderError(
      "authentication",
      "Jev authentication failed.",
      error,
    );
  }

  if (error instanceof RateLimitError) {
    return createProviderError("rate-limit", "Jev rate limit exceeded.", error);
  }

  if (error instanceof APITimeoutError) {
    return new JevAdapterError("timeout", "Jev request timed out.");
  }

  if (error instanceof APIUserAbortError) {
    return new JevAdapterError("aborted", "Jev request was cancelled.");
  }

  if (
    error instanceof InternalServerError ||
    error instanceof APIConnectionError
  ) {
    return createProviderError(
      "provider-unavailable",
      "Jev is temporarily unavailable.",
      error,
    );
  }

  if (error instanceof APIError) {
    return createProviderError(
      "unexpected",
      "Jev rejected the evaluation request.",
      error,
    );
  }

  if (error instanceof TypeSafeError) {
    return new JevAdapterError(
      "configuration",
      "Jev client configuration is invalid.",
    );
  }

  return new JevAdapterError(
    "unexpected",
    "Jev evaluation failed unexpectedly.",
  );
}

function createProviderError(
  kind: ConstructorParameters<typeof JevAdapterError>[0],
  message: string,
  error: APIError | APIConnectionError,
): JevAdapterError {
  return new JevAdapterError(
    kind,
    message,
    error instanceof APIError ? error.requestId : undefined,
  );
}
