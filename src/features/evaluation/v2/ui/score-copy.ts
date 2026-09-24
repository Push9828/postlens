import { POSTLENS_RUBRIC_V2 } from "../rubric";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type PostType,
} from "../types";

export const V2_DIMENSION_LABELS = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((dimension) => [
    dimension,
    POSTLENS_RUBRIC_V2.dimensions[dimension].label,
  ]),
) as Readonly<Record<EvaluationDimension, string>>;

export const V2_TYPE_LABELS: Readonly<Record<PostType, string>> = {
  educational: "Educational",
  opinion: "Opinion",
  story: "Story",
  "case-study": "Case study",
  reflection: "Reflection",
  announcement: "Announcement",
  "build-in-public": "Build in public",
  discussion: "Discussion",
};

export function qualityLabel(score: number): string {
  if (score >= 90) return "Exceptional against this rubric";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Developing";
  return "Needs work";
}
