import { z } from "zod";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../../evaluation/application/evaluate-post.limits";
import { postEvaluationSchema } from "../../evaluation/application/post-evaluation.schema";
import type {
  PostEvaluation,
  PostJudgments,
} from "../../evaluation/domain/evaluation.types";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../../evaluation/domain/rubric";
import { scorePost } from "../../evaluation/domain/scoring";
import {
  IMPROVEMENT_ACTIONS,
  type ImprovementAction,
} from "../domain/improvement";
import { ImprovementError } from "./improvement-error";

const requestSchema = z.strictObject({
  content: z.string(),
  action: z.enum(IMPROVEMENT_ACTIONS),
  evaluationId: z.string().uuid(),
  evaluation: postEvaluationSchema,
});

export interface ImprovementRequest {
  readonly content: string;
  readonly action: ImprovementAction;
  readonly evaluationId: string;
  readonly evaluation: PostEvaluation;
}

export function parseImprovementRequest(input: unknown): ImprovementRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new ImprovementError("INVALID_REQUEST");

  const content = parsed.data.content.trim();
  const length = countUnicodeCodePoints(content);
  if (length < MIN_POST_CHARACTERS)
    throw new ImprovementError("POST_TOO_SHORT");
  if (length > MAX_POST_CHARACTERS) throw new ImprovementError("POST_TOO_LONG");

  const evaluation = parsed.data.evaluation;
  if (
    evaluation.rubric.id !== POSTLENS_RUBRIC.id ||
    evaluation.rubric.version !== POSTLENS_RUBRIC.version
  ) {
    throw new ImprovementError("STALE_RUBRIC");
  }
  if (
    evaluation.summary.length > 600 ||
    EVALUATION_DIMENSIONS.some(
      (key) => evaluation.dimensions[key].explanation.length > 400,
    )
  ) {
    throw new ImprovementError("INVALID_REQUEST");
  }

  const calculated = scorePost({
    contentType: evaluation.contentType,
    summary: evaluation.summary,
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((key) => [
        key,
        {
          level: evaluation.dimensions[key].level,
          explanation: evaluation.dimensions[key].explanation,
          ...(evaluation.dimensions[key].confidence === undefined
            ? {}
            : { confidence: evaluation.dimensions[key].confidence }),
        },
      ]),
    ) as PostJudgments["dimensions"],
  });
  if (
    calculated.overallScore !== evaluation.overallScore ||
    calculated.strongestDimension !== evaluation.strongestDimension ||
    calculated.weakestDimension !== evaluation.weakestDimension ||
    EVALUATION_DIMENSIONS.some(
      (key) =>
        calculated.dimensions[key].score !== evaluation.dimensions[key].score,
    ) ||
    JSON.stringify(calculated.scoreInterpretation) !==
      JSON.stringify(evaluation.scoreInterpretation)
  ) {
    throw new ImprovementError("INVALID_REQUEST");
  }

  return {
    content,
    action: parsed.data.action,
    evaluationId: parsed.data.evaluationId,
    evaluation,
  };
}
