import "server-only";

import { z } from "zod";
import { EvaluatePostError } from "../../application/evaluate-post.errors";
import { V2EvaluatePostService } from "../evaluate-post";
import { JevV2PostEvaluator } from "../jev/jev-post-evaluator";
import { TypeSafeJevV2Client } from "../jev/typesafe-jev-client";

const environmentSchema = z.object({
  TYPESAFE_API_KEY: z.string().trim().min(1),
  TYPESAFE_DEFAULT_MODEL: z.string().trim().min(1).default("jev-latest"),
  TYPESAFE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

let service: V2EvaluatePostService | undefined;

export function getV2EvaluationService(): V2EvaluatePostService {
  if (service) return service;
  const config = environmentSchema.safeParse({
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    TYPESAFE_DEFAULT_MODEL:
      process.env.TYPESAFE_DEFAULT_MODEL?.trim() || undefined,
    TYPESAFE_TIMEOUT_MS: process.env.TYPESAFE_TIMEOUT_MS?.trim() || undefined,
  });
  if (!config.success)
    throw new EvaluatePostError("EVALUATION_UNAVAILABLE", false);

  service = new V2EvaluatePostService({
    evaluator: new JevV2PostEvaluator({
      client: new TypeSafeJevV2Client({
        apiKey: config.data.TYPESAFE_API_KEY,
        model: config.data.TYPESAFE_DEFAULT_MODEL,
        timeoutMs: config.data.TYPESAFE_TIMEOUT_MS,
        maxRetries: 0,
      }),
      requestedModel: config.data.TYPESAFE_DEFAULT_MODEL,
    }),
    evaluatorId: "jev",
    observe: (event) =>
      console.info(
        JSON.stringify({
          ...event,
          requestedModel: config.data.TYPESAFE_DEFAULT_MODEL,
        }),
      ),
  });
  return service;
}
