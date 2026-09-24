import { z } from "zod";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
} from "../domain/evaluation.types";

const dimensionScoreSchema = z.union([
  z.literal(0),
  z.literal(25),
  z.literal(50),
  z.literal(75),
  z.literal(100),
]);

const dimensionEvaluationSchema = z.strictObject({
  level: z.union(EVALUATION_LEVELS.map((level) => z.literal(level))),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  score: dimensionScoreSchema,
});

const dimensionShape = Object.fromEntries(
  EVALUATION_DIMENSIONS.map((dimension) => [
    dimension,
    dimensionEvaluationSchema,
  ]),
) as Record<
  (typeof EVALUATION_DIMENSIONS)[number],
  typeof dimensionEvaluationSchema
>;

export const postEvaluationSchema = z.strictObject({
  rubric: z.strictObject({ id: z.string().min(1), version: z.string().min(1) }),
  overallScore: z.number().int().min(0).max(100),
  scoreInterpretation: z.strictObject({
    id: z.enum([
      "needs-substantial-work",
      "developing",
      "solid",
      "strong",
      "exceptional",
    ]),
    label: z.string().min(1),
    minimumScore: z.number().int().min(0).max(100),
    maximumScore: z.number().int().min(0).max(100),
  }),
  dimensions: z.strictObject(dimensionShape),
  strongestDimension: z.enum(EVALUATION_DIMENSIONS),
  weakestDimension: z.enum(EVALUATION_DIMENSIONS),
  contentType: z.enum(CONTENT_TYPES),
  summary: z.string().min(1),
});
