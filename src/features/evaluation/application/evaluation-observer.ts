import type {
  ContentType,
  DimensionScore,
  EvaluationDimension,
  RubricReference,
} from "../domain/evaluation.types";
import type { EvaluatePostErrorCode } from "./evaluate-post.errors";

interface EvaluationEventBase {
  readonly timestamp: string;
  readonly evaluationId: string;
  readonly evaluatorId: string;
  readonly totalDurationMs: number;
}

export interface EvaluationSucceededEvent extends EvaluationEventBase {
  readonly type: "evaluation.succeeded";
  readonly characterCount: number;
  readonly evaluatorDurationMs: number;
  readonly rubric: RubricReference;
  readonly contentType: ContentType;
  readonly dimensionScores: Readonly<
    Record<EvaluationDimension, DimensionScore>
  >;
  readonly overallScore: number;
}

export interface EvaluationFailedEvent extends EvaluationEventBase {
  readonly type: "evaluation.failed";
  readonly errorCode: EvaluatePostErrorCode;
  readonly characterCount?: number;
  readonly evaluatorDurationMs?: number;
}

export type EvaluationEvent = EvaluationSucceededEvent | EvaluationFailedEvent;

export interface EvaluationObserver {
  observe(event: EvaluationEvent): void;
}
