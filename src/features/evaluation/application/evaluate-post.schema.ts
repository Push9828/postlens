import { z } from "zod";
import type { EvaluatePostInput } from "../domain/evaluation.types";
import { EvaluatePostError } from "./evaluate-post.errors";

export const MIN_POST_CHARACTERS = 20;
export const MAX_POST_CHARACTERS = 3_000;

const evaluatePostRequestSchema = z.strictObject({
  content: z.string(),
});

export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length;
}

export function parseEvaluatePostInput(input: unknown): EvaluatePostInput {
  const result = evaluatePostRequestSchema.safeParse(input);

  if (!result.success) {
    throw new EvaluatePostError("INVALID_REQUEST");
  }

  const content = result.data.content.trim();
  const characterCount = countUnicodeCodePoints(content);

  if (characterCount < MIN_POST_CHARACTERS) {
    throw new EvaluatePostError("POST_TOO_SHORT");
  }

  if (characterCount > MAX_POST_CHARACTERS) {
    throw new EvaluatePostError("POST_TOO_LONG");
  }

  return { content };
}
