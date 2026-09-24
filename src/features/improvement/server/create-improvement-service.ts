import "server-only";

import { z } from "zod";
import { ImprovePostService } from "../application/improve-post";
import { ImprovementError } from "../application/improvement-error";
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

let service: ImprovePostService | undefined;

export function getImprovementService(): ImprovePostService {
  if (service) return service;
  const config = configSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMPROVEMENT_MODEL: process.env.OPENAI_IMPROVEMENT_MODEL || undefined,
    OPENAI_IMPROVEMENT_TIMEOUT_MS:
      process.env.OPENAI_IMPROVEMENT_TIMEOUT_MS || undefined,
  });
  if (!config.success) throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
  service = new ImprovePostService(
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
  );
  return service;
}
