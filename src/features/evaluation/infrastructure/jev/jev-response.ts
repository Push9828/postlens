import { z } from "zod";
import {
  CONTENT_TYPES,
  type ContentType,
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "../../domain/evaluation.types";
import {
  getJevReasonKey,
  getJevScoreKey,
  JEV_CONTENT_TYPE_KEY,
  type JevExplanationMode,
} from "./jev.types";
import { getReasonDefinition } from "./jev-reasons";

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
  choice: z.string(),
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

export interface ParsedJevScoreAnswer {
  readonly expectedScore: number;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<EvaluationLevel, number>>;
}

export interface ParsedJevReasonAnswer {
  readonly code: string;
  readonly confidence: number;
}

export interface ParsedJevDimensionAnswer extends ParsedJevScoreAnswer {
  readonly reason?: ParsedJevReasonAnswer;
}

export interface ParsedJevResponse {
  readonly model: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  readonly dimensions: Readonly<
    Record<EvaluationDimension, ParsedJevDimensionAnswer>
  >;
  readonly contentType: ContentType;
  readonly contentTypeConfidence: number;
}

export function parseJevResponse(
  input: unknown,
  explanationMode: JevExplanationMode,
): ParsedJevResponse {
  const envelope = responseEnvelopeSchema.parse(input);

  const dimensions = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => {
      const scoreAnswer = scoreAnswerSchema.parse(
        envelope.answers[getJevScoreKey(dimension)],
      );
      const reason = parseReasonAnswer(
        envelope.answers,
        dimension,
        explanationMode,
      );

      return [
        dimension,
        {
          expectedScore: scoreAnswer.score,
          confidence: scoreAnswer.confidence,
          probabilities: {
            0: scoreAnswer.probabilities["0"],
            1: scoreAnswer.probabilities["1"],
            2: scoreAnswer.probabilities["2"],
            3: scoreAnswer.probabilities["3"],
            4: scoreAnswer.probabilities["4"],
          },
          ...(reason === undefined ? {} : { reason }),
        },
      ] as const;
    }),
  ) as Readonly<Record<EvaluationDimension, ParsedJevDimensionAnswer>>;

  const contentTypeAnswer = choiceAnswerSchema.parse(
    envelope.answers[JEV_CONTENT_TYPE_KEY],
  );

  if (!isContentType(contentTypeAnswer.choice)) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["answers", JEV_CONTENT_TYPE_KEY, "choice"],
        message: `Unknown content type: ${contentTypeAnswer.choice}`,
      },
    ]);
  }

  return {
    model: envelope.model,
    usage: {
      inputTokens: envelope.usage.input_tokens,
      outputTokens: envelope.usage.output_tokens,
    },
    dimensions,
    contentType: contentTypeAnswer.choice,
    contentTypeConfidence: contentTypeAnswer.confidence,
  };
}

function parseReasonAnswer(
  answers: Readonly<Record<string, unknown>>,
  dimension: EvaluationDimension,
  explanationMode: JevExplanationMode,
): ParsedJevReasonAnswer | undefined {
  if (explanationMode === "rubric-level") {
    return undefined;
  }

  const answer = choiceAnswerSchema.parse(answers[getJevReasonKey(dimension)]);

  if (getReasonDefinition(dimension, answer.choice) === undefined) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["answers", getJevReasonKey(dimension), "choice"],
        message: `Unknown reason code: ${answer.choice}`,
      },
    ]);
  }

  return {
    code: answer.choice,
    confidence: answer.confidence,
  };
}

function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.some((contentType) => contentType === value);
}
