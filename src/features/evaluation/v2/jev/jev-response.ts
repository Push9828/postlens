import { z } from "zod";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
  POST_TYPES,
  type PostType,
} from "../types";
import {
  PRIMARY_TYPE_KEY,
  SECONDARY_TYPE_KEY,
  scoreQuestionKey,
  TYPE_EVIDENCE_KEY,
} from "./jev.types";
import { CLASSIFICATION_EVIDENCE } from "./typesafe-jev-client";

const probabilitySchema = z.number().finite().min(0).max(1);
const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number().finite().min(0).max(4),
  confidence: probabilitySchema,
  legend: z.object({
    "0": z.string(),
    "1": z.string(),
    "2": z.string(),
    "3": z.string(),
    "4": z.string(),
  }),
  probabilities: z.object({
    "0": probabilitySchema,
    "1": probabilitySchema,
    "2": probabilitySchema,
    "3": probabilitySchema,
    "4": probabilitySchema,
  }),
});
const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: probabilitySchema,
  probabilities: z.record(z.string(), probabilitySchema),
});
const responseEnvelopeSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export interface ParsedV2ScoreAnswer {
  readonly expectedLevel: number;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<EvaluationLevel, number>>;
}

export interface ParsedJevV2Response {
  readonly model: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly dimensions: Readonly<
    Record<EvaluationDimension, ParsedV2ScoreAnswer>
  >;
  readonly primaryType: PostType;
  readonly secondaryType?: PostType;
  readonly secondaryChoice: PostType | "none";
  readonly secondaryConfidence: number;
  readonly confidence: number;
  readonly evidenceCode: keyof typeof CLASSIFICATION_EVIDENCE;
}

export function parseJevV2Response(input: unknown): ParsedJevV2Response {
  const envelope = responseEnvelopeSchema.parse(input);
  const primaryAnswer = choiceAnswerSchema.parse(
    envelope.answers[PRIMARY_TYPE_KEY],
  );
  const secondaryAnswer = choiceAnswerSchema.parse(
    envelope.answers[SECONDARY_TYPE_KEY],
  );
  const evidenceAnswer = choiceAnswerSchema.parse(
    envelope.answers[TYPE_EVIDENCE_KEY],
  );

  if (!isPostType(primaryAnswer.choice)) {
    throw invalidChoice(PRIMARY_TYPE_KEY, primaryAnswer.choice);
  }
  if (
    secondaryAnswer.choice !== "none" &&
    !isPostType(secondaryAnswer.choice)
  ) {
    throw invalidChoice(SECONDARY_TYPE_KEY, secondaryAnswer.choice);
  }
  if (!isEvidenceCode(evidenceAnswer.choice)) {
    throw invalidChoice(TYPE_EVIDENCE_KEY, evidenceAnswer.choice);
  }
  for (const [key, answer] of [
    [PRIMARY_TYPE_KEY, primaryAnswer],
    [SECONDARY_TYPE_KEY, secondaryAnswer],
    [TYPE_EVIDENCE_KEY, evidenceAnswer],
  ] as const) {
    if (answer.probabilities[answer.choice] === undefined) {
      throw invalidChoice(key, answer.choice);
    }
  }

  const dimensions = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => {
      const answer = scoreAnswerSchema.parse(
        envelope.answers[scoreQuestionKey(dimension)],
      );
      return [
        dimension,
        {
          expectedLevel: answer.score,
          confidence: answer.confidence,
          probabilities: {
            0: answer.probabilities["0"],
            1: answer.probabilities["1"],
            2: answer.probabilities["2"],
            3: answer.probabilities["3"],
            4: answer.probabilities["4"],
          },
        },
      ] as const;
    }),
  ) as Readonly<Record<EvaluationDimension, ParsedV2ScoreAnswer>>;

  const primaryType = primaryAnswer.choice;
  const secondaryType = secondaryAnswer.choice;
  return {
    model: envelope.model,
    usage: {
      inputTokens: envelope.usage.input_tokens,
      outputTokens: envelope.usage.output_tokens,
    },
    dimensions,
    primaryType,
    ...(secondaryType === "none" || secondaryType === primaryType
      ? {}
      : { secondaryType }),
    secondaryChoice: secondaryType,
    secondaryConfidence: secondaryAnswer.confidence,
    confidence: primaryAnswer.confidence,
    evidenceCode: evidenceAnswer.choice,
  };
}

function isPostType(value: string): value is PostType {
  return POST_TYPES.some((type) => type === value);
}

function isEvidenceCode(
  value: string,
): value is keyof typeof CLASSIFICATION_EVIDENCE {
  return Object.hasOwn(CLASSIFICATION_EVIDENCE, value);
}

function invalidChoice(key: string, value: string): z.ZodError {
  return new z.ZodError([
    {
      code: "custom",
      path: ["answers", key, "choice"],
      message: `Invalid choice: ${value}`,
    },
  ]);
}
