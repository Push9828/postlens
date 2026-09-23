import "server-only";

import { z } from "zod";
import { EvaluatePostError, EvaluatePostService } from "../application";
import { JevPostEvaluator, TypeSafeJevClient } from "../infrastructure/jev";
import { ConsoleEvaluationObserver } from "../infrastructure/telemetry/console-evaluation-observer";

const environmentSchema = z.object({
  TYPESAFE_API_KEY: z.string().trim().min(1),
  TYPESAFE_DEFAULT_MODEL: z.string().trim().min(1).default("jev-latest"),
  TYPESAFE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

let service: EvaluatePostService | undefined;

export function getEvaluationService(): EvaluatePostService {
  if (service !== undefined) {
    return service;
  }

  const config = environmentSchema.safeParse({
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    TYPESAFE_DEFAULT_MODEL:
      process.env.TYPESAFE_DEFAULT_MODEL?.trim() || undefined,
    TYPESAFE_TIMEOUT_MS: process.env.TYPESAFE_TIMEOUT_MS?.trim() || undefined,
  });

  if (!config.success) {
    throw new EvaluatePostError("EVALUATION_UNAVAILABLE", false);
  }

  const client = new TypeSafeJevClient({
    apiKey: config.data.TYPESAFE_API_KEY,
    model: config.data.TYPESAFE_DEFAULT_MODEL,
    timeoutMs: config.data.TYPESAFE_TIMEOUT_MS,
    maxRetries: 0,
  });
  const evaluator = new JevPostEvaluator({
    client,
    requestedModel: config.data.TYPESAFE_DEFAULT_MODEL,
    explanationMode: "reason-code",
  });

  service = new EvaluatePostService({
    evaluator,
    evaluatorId: "jev",
    observe: new ConsoleEvaluationObserver(),
  });

  return service;
}
