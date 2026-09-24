import { z } from "zod";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  POST_TYPES,
  RUBRIC_VERSION,
} from "./types";

const postTypeSchema = z.enum(POST_TYPES);
const levelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const dimensionJudgmentSchema = z.strictObject({
  level: levelSchema,
  explanation: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
});
const rawDimensionsSchema = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      dimensionJudgmentSchema,
    ]),
  ) as Record<EvaluationDimension, typeof dimensionJudgmentSchema>,
);
const weightSchema = z.number().finite().min(0).max(100);
const weightsSchema = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, weightSchema]),
  ) as Record<EvaluationDimension, typeof weightSchema>,
);
const dimensionScoresSchema = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      z.union([
        z.literal(0),
        z.literal(25),
        z.literal(50),
        z.literal(75),
        z.literal(100),
      ]),
    ]),
  ) as unknown as Record<
    EvaluationDimension,
    z.ZodType<0 | 25 | 50 | 75 | 100>
  >,
);

export const v2EvaluationSchema = z.strictObject({
  rubricVersion: z.literal(RUBRIC_VERSION),
  detectedClassification: z.strictObject({
    primaryType: postTypeSchema,
    secondaryType: postTypeSchema.optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1).max(500),
  }),
  rawEvaluation: z.strictObject({ dimensions: rawDimensionsSchema }),
  dimensionScores: dimensionScoresSchema,
  resolvedProfile: z.strictObject({
    qualityWeights: weightsSchema,
    engagementWeights: weightsSchema,
    source: z.enum([
      "ai-primary",
      "ai-blended",
      "generic-fallback",
      "user-override",
    ]),
    resolvedPostType: z.union([postTypeSchema, z.literal("generic")]),
    secondaryType: postTypeSchema.optional(),
  }),
  scores: z.strictObject({
    contentQuality: z.number().finite().min(0).max(100),
    engagementPotential: z.number().finite().min(0).max(100),
  }),
});

export const v2EvaluationResponseSchema = z.strictObject({
  evaluationId: z.uuid(),
  evaluation: v2EvaluationSchema,
});

export const v2EvaluationErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "INVALID_REQUEST",
      "POST_TOO_SHORT",
      "POST_TOO_LONG",
      "REQUEST_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "EVALUATION_TIMEOUT",
      "EVALUATION_BUSY",
      "EVALUATION_UNAVAILABLE",
      "EVALUATION_FAILED",
      "INTERNAL_ERROR",
    ]),
    message: z.string().min(1),
    retryable: z.boolean(),
    evaluationId: z.uuid(),
  }),
});
