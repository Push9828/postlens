import "server-only";

import { z } from "zod";
import { getV2EvaluationService } from "../../../evaluation/v2/server/create-evaluation-service";
import { ImprovementError } from "../../application/improvement-error";
import { V2ImprovePostService } from "../improve-post";
import { V2OpenAIPostImprover } from "../openai-post-improver";

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
let service: V2ImprovePostService | undefined;
export function getV2ImprovementService(): V2ImprovePostService {
  if (service) return service;
  const config = configSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMPROVEMENT_MODEL: process.env.OPENAI_IMPROVEMENT_MODEL || undefined,
    OPENAI_IMPROVEMENT_TIMEOUT_MS:
      process.env.OPENAI_IMPROVEMENT_TIMEOUT_MS || undefined,
  });
  if (!config.success) throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
  service = new V2ImprovePostService(
    new V2OpenAIPostImprover({
      apiKey: config.data.OPENAI_API_KEY,
      model: config.data.OPENAI_IMPROVEMENT_MODEL,
      timeoutMs: config.data.OPENAI_IMPROVEMENT_TIMEOUT_MS,
    }),
    getV2EvaluationService(),
    (event) =>
      console.info(
        JSON.stringify({
          ...event,
          generatorModel: config.data.OPENAI_IMPROVEMENT_MODEL,
          evaluatorModel:
            process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest",
        }),
      ),
  );
  return service;
}
