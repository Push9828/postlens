import {
  type ContentType,
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "./evaluation.types";
import { POSTLENS_RUBRIC } from "./rubric";

export function createJudgmentSummary(
  levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>,
  contentType: ContentType,
): string {
  const strongest = select(levels, "strongest");
  const weakest = select(levels, "weakest");
  return `This ${contentType} draft is strongest in ${POSTLENS_RUBRIC.dimensions[strongest].label} and weakest in ${POSTLENS_RUBRIC.dimensions[weakest].label} against the current rubric.`;
}

function select(
  levels: Readonly<Record<EvaluationDimension, EvaluationLevel>>,
  direction: "strongest" | "weakest",
): EvaluationDimension {
  return EVALUATION_DIMENSIONS.reduce((selected, candidate) => {
    if (direction === "strongest" && levels[candidate] > levels[selected])
      return candidate;
    if (direction === "weakest" && levels[candidate] < levels[selected])
      return candidate;
    return selected;
  });
}
