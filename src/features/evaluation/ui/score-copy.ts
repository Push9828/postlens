import type {
  ContentType,
  EvaluationDimension,
} from "../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../domain/rubric";

export const DIMENSION_LABELS: Readonly<Record<EvaluationDimension, string>> =
  Object.fromEntries(
    Object.entries(POSTLENS_RUBRIC.dimensions).map(([dimension, rubric]) => [
      dimension,
      rubric.label,
    ]),
  ) as Readonly<Record<EvaluationDimension, string>>;

export const CONTENT_TYPE_LABELS: Readonly<Record<ContentType, string>> = {
  educational: "Educational",
  story: "Story",
  opinion: "Opinion",
  "case-study": "Case study",
  reflection: "Reflection",
  announcement: "Announcement",
  "build-in-public": "Build in public",
  other: "Other",
};
