import "server-only";

import { z } from "zod";
import { POSTLENS_RUBRIC } from "../../evaluation/domain/rubric";
import { getComparisonService } from "../../evaluation/server/create-comparison-service";
import { ImprovePostService } from "../application/improve-post";
import { ImprovementError } from "../application/improvement-error";
import { VerifyImprovementService } from "../application/verify-improvement";
import { OpenAIPostImprover } from "../infrastructure/openai-post-improver";

const configSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_IMPROVEMENT_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  OPENAI_IMPROVEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(20_000),
});

let service: VerifyImprovementService | undefined;

export function getImprovementService(): VerifyImprovementService {
  if (service) return service;
  const config = configSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMPROVEMENT_MODEL: process.env.OPENAI_IMPROVEMENT_MODEL || undefined,
    OPENAI_IMPROVEMENT_TIMEOUT_MS:
      process.env.OPENAI_IMPROVEMENT_TIMEOUT_MS || undefined,
  });
  if (!config.success) throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
  let comparer: ReturnType<typeof getComparisonService>;
  try {
    comparer = getComparisonService();
  } catch {
    throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
  }
  service = new VerifyImprovementService(
    new ImprovePostService(
      new OpenAIPostImprover({
        apiKey: config.data.OPENAI_API_KEY,
        model: config.data.OPENAI_IMPROVEMENT_MODEL,
        timeoutMs: config.data.OPENAI_IMPROVEMENT_TIMEOUT_MS,
      }),
      (event) =>
        console.info(
          JSON.stringify({
            type: "improvement",
            provider: "openai",
            model: config.data.OPENAI_IMPROVEMENT_MODEL,
            ...event,
          }),
        ),
    ),
    comparer,
    (event) =>
      console.info(
        JSON.stringify({
          type: "improvement.verification",
          generatorModel: config.data.OPENAI_IMPROVEMENT_MODEL,
          evaluator: "jev",
          evaluatorModel:
            process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest",
          rubric: POSTLENS_RUBRIC.version,
          ...event,
        }),
      ),
  );
  return service;
}
