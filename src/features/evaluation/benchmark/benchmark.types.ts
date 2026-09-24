import type {
  ContentType,
  EvaluationDimension,
  EvaluationLevel,
} from "../domain/evaluation.types";

export type BenchmarkProvider = "jev" | "openai-llm";
export type BenchmarkFailureKind =
  | "configuration"
  | "authentication"
  | "timeout"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "aborted"
  | "unexpected"
  | "domain-validation";

export interface BenchmarkAttemptBase {
  readonly key: string;
  readonly fixtureId: string;
  readonly category: string;
  readonly provider: BenchmarkProvider;
  readonly repetition: number;
  readonly order: number;
  readonly recordedAt: string;
  readonly requestedModel: string;
  readonly totalLatencyMs: number;
  readonly evaluatorLatencyMs: number | null;
}

export type BenchmarkAttempt =
  | (BenchmarkAttemptBase & {
      readonly status: "success";
      readonly resolvedModel: string;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
      readonly levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>;
      readonly overallScore: number;
      readonly contentType: ContentType;
    })
  | (BenchmarkAttemptBase & {
      readonly status: "failure";
      readonly errorKind: BenchmarkFailureKind;
    });

export interface HumanLabel {
  readonly fixtureId: string;
  readonly raterId: string;
  readonly labeledAt: string;
  readonly levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>;
  readonly ambiguityNote?: string;
}

export interface HumanLabelFile {
  readonly datasetHash: string;
  readonly rubricVersion: string;
  readonly primaryRaterId: string;
  readonly labels: readonly HumanLabel[];
}

export interface TokenPrices {
  readonly currency: "USD";
  readonly source: string;
  readonly effectiveDate: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
}

export function attemptKey(
  fixtureId: string,
  repetition: number,
  provider: BenchmarkProvider,
): string {
  return `${fixtureId}:${repetition}:${provider}`;
}
