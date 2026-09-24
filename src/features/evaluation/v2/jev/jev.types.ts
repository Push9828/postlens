import type {
  EvaluationDimension,
  EvaluationLevel,
  PostType,
  PostTypeClassification,
  RawPostEvaluation,
} from "../types";

export interface JevV2Client {
  evaluate(content: string): Promise<unknown>;
}

export interface JevV2Judgments {
  readonly classification: PostTypeClassification;
  readonly rawEvaluation: RawPostEvaluation;
}

export interface JevV2Diagnostics {
  readonly provider: "jev";
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly rubricVersion: "2.0";
  readonly latencyMs: number;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly classification: {
    readonly primaryType: PostType;
    readonly secondaryType?: PostType;
    readonly confidence: number;
    readonly secondaryChoice: PostType | "none";
    readonly secondaryConfidence: number;
    readonly evidenceCode: string;
  };
  readonly dimensions: Readonly<
    Record<
      EvaluationDimension,
      {
        readonly selectedLevel: EvaluationLevel;
        readonly expectedLevel: number;
        readonly confidence: number;
      }
    >
  >;
}

export type JevV2DiagnosticsObserver = (diagnostics: JevV2Diagnostics) => void;

export function scoreQuestionKey(dimension: EvaluationDimension): string {
  return `v2_score_${dimension}`;
}

export const PRIMARY_TYPE_KEY = "v2_primary_type";
export const SECONDARY_TYPE_KEY = "v2_secondary_type";
export const TYPE_EVIDENCE_KEY = "v2_type_evidence";
