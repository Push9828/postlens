import { z } from "zod";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
} from "../domain/evaluation.types";
import { attemptKey, type BenchmarkAttempt } from "./benchmark.types";

const level = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const levels = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, level]),
  ) as unknown as Record<(typeof EVALUATION_DIMENSIONS)[number], typeof level>,
);
const base = {
  key: z.string().min(1),
  fixtureId: z.string().min(1),
  category: z.string().min(1),
  provider: z.enum(["jev", "openai-llm"]),
  repetition: z.number().int().positive(),
  order: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
  requestedModel: z.string().min(1),
  totalLatencyMs: z.number().finite().nonnegative(),
  evaluatorLatencyMs: z.number().finite().nonnegative().nullable(),
};
const attemptSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...base,
    status: z.literal("success"),
    resolvedModel: z.string().min(1),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    levels,
    overallScore: z.number().int().min(0).max(100),
    contentType: z.enum(CONTENT_TYPES),
  }),
  z.strictObject({
    ...base,
    status: z.literal("failure"),
    errorKind: z.enum([
      "configuration",
      "authentication",
      "timeout",
      "rate-limit",
      "unavailable",
      "invalid-response",
      "aborted",
      "unexpected",
      "domain-validation",
    ]),
  }),
]);

export function parseSavedAttempts(source: string): BenchmarkAttempt[] {
  return source
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      let input: unknown;
      try {
        input = JSON.parse(line);
      } catch {
        throw new Error("Saved attempt JSON is invalid.");
      }
      const parsed = attemptSchema.safeParse(input);
      if (!parsed.success) throw new Error("Saved attempt record is invalid.");
      if (
        parsed.data.key !==
        attemptKey(
          parsed.data.fixtureId,
          parsed.data.repetition,
          parsed.data.provider,
        )
      )
        throw new Error("Saved attempt key is inconsistent.");
      return parsed.data satisfies BenchmarkAttempt;
    });
}
