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
import { POSTLENS_RUBRIC_V2 } from "../rubric";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  type PostType,
  RUBRIC_VERSION,
} from "../types";
import type {
  JevV2Client,
  JevV2Diagnostics,
  JevV2DiagnosticsObserver,
  JevV2Judgments,
} from "./jev.types";
import { V2JevEvaluatorError } from "./jev-error";
import { parseJevV2Response } from "./jev-response";
import { CLASSIFICATION_EVIDENCE } from "./typesafe-jev-client";

const EVIDENCE_BY_TYPE = {
  educational: "explanation",
  opinion: "argument",
  story: "narrative",
  "case-study": "problem_resolution",
  reflection: "realization",
  announcement: "news",
  "build-in-public": "building_process",
  discussion: "substantive_question",
} as const satisfies Readonly<
  Record<PostType, keyof typeof CLASSIFICATION_EVIDENCE>
>;

export interface JevV2PostEvaluatorOptions {
  readonly client: JevV2Client;
  readonly requestedModel?: string;
  readonly onDiagnostics?: JevV2DiagnosticsObserver;
}

export class JevV2PostEvaluator {
  private readonly client: JevV2Client;
  private readonly requestedModel: string;
  private readonly onDiagnostics?: JevV2DiagnosticsObserver;

  constructor(options: JevV2PostEvaluatorOptions) {
    this.client = options.client;
    this.requestedModel = options.requestedModel ?? "jev-latest";
    this.onDiagnostics = options.onDiagnostics;
  }

  async evaluate(content: string): Promise<JevV2Judgments> {
    const startedAt = performance.now();
    try {
      const parsed = parseJevV2Response(await this.client.evaluate(content));
      const levels = Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          dimension,
          selectJevV2Level(parsed.dimensions[dimension].probabilities),
        ]),
      ) as Record<(typeof EVALUATION_DIMENSIONS)[number], EvaluationLevel>;
      const rawEvaluation: JevV2Judgments["rawEvaluation"] = {
        dimensions: Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [
            dimension,
            {
              level: levels[dimension],
              explanation:
                POSTLENS_RUBRIC_V2.dimensions[dimension].levels[
                  levels[dimension]
                ],
              confidence: parsed.dimensions[dimension].confidence,
            },
          ]),
        ) as JevV2Judgments["rawEvaluation"]["dimensions"],
      };
      const classification: JevV2Judgments["classification"] = {
        primaryType: parsed.primaryType,
        ...(parsed.secondaryType === undefined
          ? {}
          : { secondaryType: parsed.secondaryType }),
        confidence: parsed.confidence,
        reasoning: reasoningFor(parsed.primaryType, parsed.evidenceCode),
      };
      const diagnostics: JevV2Diagnostics = {
        provider: "jev",
        requestedModel: this.requestedModel,
        resolvedModel: parsed.model,
        rubricVersion: RUBRIC_VERSION,
        latencyMs: Math.max(0, performance.now() - startedAt),
        usage: parsed.usage,
        classification: {
          primaryType: classification.primaryType,
          ...(classification.secondaryType === undefined
            ? {}
            : { secondaryType: classification.secondaryType }),
          confidence: classification.confidence,
          secondaryChoice: parsed.secondaryChoice,
          secondaryConfidence: parsed.secondaryConfidence,
          evidenceCode: parsed.evidenceCode,
        },
        dimensions: Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [
            dimension,
            {
              selectedLevel: levels[dimension],
              expectedLevel: parsed.dimensions[dimension].expectedLevel,
              confidence: parsed.dimensions[dimension].confidence,
            },
          ]),
        ) as JevV2Diagnostics["dimensions"],
      };
      try {
        this.onDiagnostics?.(diagnostics);
      } catch {
        // Reporting must never change evaluation behavior.
      }
      return { classification, rawEvaluation };
    } catch (error) {
      throw mapJevV2Error(error);
    }
  }
}

export function selectJevV2Level(
  probabilities: Readonly<Record<EvaluationLevel, number>>,
): EvaluationLevel {
  const levels = [0, 1, 2, 3, 4] as const;
  return levels.reduce((selected, candidate) =>
    probabilities[candidate] > probabilities[selected] ? candidate : selected,
  );
}

function reasoningFor(
  primaryType: PostType,
  evidenceCode: keyof typeof CLASSIFICATION_EVIDENCE,
): string {
  if (EVIDENCE_BY_TYPE[primaryType] === evidenceCode) {
    return CLASSIFICATION_EVIDENCE[evidenceCode].reasoning;
  }
  return `The post's main communicative purpose is ${primaryType.replaceAll("-", " ")}.`;
}

function mapJevV2Error(error: unknown): V2JevEvaluatorError {
  if (error instanceof V2JevEvaluatorError) return error;
  if (error instanceof z.ZodError) {
    return new V2JevEvaluatorError(
      "invalid-response",
      "Jev returned a response that does not match the expected schema.",
    );
  }
  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  ) {
    return new V2JevEvaluatorError(
      "authentication",
      "Jev authentication failed.",
    );
  }
  if (error instanceof RateLimitError) {
    return new V2JevEvaluatorError("rate-limit", "Jev rate limit exceeded.");
  }
  if (error instanceof APITimeoutError) {
    return new V2JevEvaluatorError("timeout", "Jev request timed out.");
  }
  if (error instanceof APIUserAbortError) {
    return new V2JevEvaluatorError("aborted", "Jev request was cancelled.");
  }
  if (
    error instanceof InternalServerError ||
    error instanceof APIConnectionError
  ) {
    return new V2JevEvaluatorError(
      "unavailable",
      "Jev is temporarily unavailable.",
    );
  }
  if (error instanceof APIError) {
    return new V2JevEvaluatorError(
      "unexpected",
      "Jev rejected the evaluation request.",
    );
  }
  if (error instanceof TypeSafeError) {
    return new V2JevEvaluatorError(
      "configuration",
      "Jev client configuration is invalid.",
    );
  }
  return new V2JevEvaluatorError(
    "unexpected",
    "Jev evaluation failed unexpectedly.",
  );
}
