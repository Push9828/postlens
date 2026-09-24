import type {
  ContentType,
  EvaluationDimension,
  EvaluationLevel,
  RubricReference,
} from "../../evaluation/domain/evaluation.types";
import type { DimensionRubric } from "../../evaluation/domain/rubric";
import type { ImprovementAction } from "../domain/improvement";

export interface ImprovementFocus {
  readonly dimension: EvaluationDimension;
  readonly level: EvaluationLevel;
  readonly explanation: string;
}

export interface ImprovementDimension {
  readonly level: EvaluationLevel;
  readonly score: number;
  readonly explanation: string;
  readonly criterion: DimensionRubric;
}

export interface ImprovementContext {
  readonly content: string;
  readonly action: ImprovementAction;
  readonly rubric: RubricReference;
  readonly contentType: ContentType;
  readonly overallScore: number;
  readonly dimensions: Readonly<
    Record<EvaluationDimension, ImprovementDimension>
  >;
  readonly strongestDimension: EvaluationDimension;
  readonly weakestDimension: EvaluationDimension;
  readonly focus: readonly ImprovementFocus[];
  readonly targetText?: string;
}

export type ImprovementOutput =
  | {
      readonly status: "suggested";
      readonly text: string;
      readonly changeNote: string;
    }
  | { readonly status: "no-safe-change"; readonly reason: string };

export interface PostImprover {
  improve(context: ImprovementContext): Promise<ImprovementOutput>;
}

export type PostImproverErrorKind =
  | "timeout"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "unexpected";

export class PostImproverError extends Error {
  override readonly name = "PostImproverError";
  constructor(readonly kind: PostImproverErrorKind) {
    super(kind);
  }
}
