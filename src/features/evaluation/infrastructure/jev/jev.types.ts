import type {
  ContentType,
  EvaluationDimension,
  EvaluationLevel,
} from "../../domain/evaluation.types";

export type JevExplanationMode = "rubric-level" | "reason-code";

export interface JevClientRequest {
  readonly content: string;
  readonly explanationMode: JevExplanationMode;
}

export interface JevDecisionClient {
  evaluate(request: JevClientRequest): Promise<unknown>;
}

export interface JevUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface JevDimensionDiagnostics {
  readonly selectedLevel: EvaluationLevel;
  readonly expectedScore: number;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<EvaluationLevel, number>>;
  readonly reasonCode?: string;
  readonly reasonConfidence?: number;
}

export interface JevEvaluationDiagnostics {
  readonly provider: "jev";
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly rubric: {
    readonly id: string;
    readonly version: string;
  };
  readonly explanationMode: JevExplanationMode;
  readonly latencyMs: number;
  readonly usage: JevUsage;
  readonly dimensions: Readonly<
    Record<EvaluationDimension, JevDimensionDiagnostics>
  >;
  readonly contentType: ContentType;
  readonly contentTypeConfidence: number;
}

export type JevDiagnosticsObserver = (
  diagnostics: JevEvaluationDiagnostics,
) => void;

export function getJevScoreKey(dimension: EvaluationDimension): string {
  return `score_${dimension}`;
}

export function getJevReasonKey(dimension: EvaluationDimension): string {
  return `reason_${dimension}`;
}

export const JEV_CONTENT_TYPE_KEY = "content_type";
