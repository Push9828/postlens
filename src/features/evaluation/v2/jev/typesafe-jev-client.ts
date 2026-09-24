import {
  type ChoiceCriteria,
  choice,
  type Question,
  score,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import { z } from "zod";
import { POSTLENS_RUBRIC_V2 } from "../rubric";
import { EVALUATION_DIMENSIONS, type PostType } from "../types";
import {
  type JevV2Client,
  PRIMARY_TYPE_KEY,
  SECONDARY_TYPE_KEY,
  scoreQuestionKey,
  TYPE_EVIDENCE_KEY,
} from "./jev.types";

export const POST_TYPE_CRITERIA = {
  educational:
    "Dominant purpose is to teach, explain, demonstrate, or simplify a concept, method, or lesson.",
  opinion:
    "Dominant purpose is to argue for, challenge, or present a viewpoint; a passing opinion is insufficient.",
  story:
    "Dominant purpose is to tell an experience through narrative progression, tension, and outcome.",
  "case-study":
    "Dominant purpose is to explain a concrete problem, action or decision, outcome, and lesson.",
  reflection:
    "Dominant purpose is to explore a realization, change in thinking, or personal observation without primarily arguing a thesis.",
  announcement:
    "Dominant purpose is to communicate news, an achievement, a release, an event, or a milestone.",
  "build-in-public":
    "Dominant purpose is to share an ongoing building process, including progress, decisions, experiments, or setbacks.",
  discussion:
    "Dominant purpose is to frame a substantive question, dilemma, or comparison for meaningful discussion; a request for comments alone does not qualify.",
} as const satisfies Readonly<Record<PostType, string>> & ChoiceCriteria;

export const CLASSIFICATION_EVIDENCE = {
  explanation: {
    criterion:
      "The core of the draft explains a concept, method, or reusable lesson.",
    reasoning:
      "The post mainly explains a concept, method, or reusable lesson.",
  },
  argument: {
    criterion:
      "The core of the draft supports or challenges a viewpoint with an argument.",
    reasoning: "The post mainly develops an argument or viewpoint.",
  },
  narrative: {
    criterion:
      "The core of the draft follows an experience through a sequence of events.",
    reasoning: "The post mainly follows an experience through a narrative.",
  },
  problem_resolution: {
    criterion:
      "The core of the draft explains a concrete problem, action, and outcome.",
    reasoning:
      "The post mainly examines a concrete problem, action, and outcome.",
  },
  realization: {
    criterion:
      "The core of the draft is a personal realization or change in thinking.",
    reasoning: "The post mainly explores a realization or change in thinking.",
  },
  news: {
    criterion: "The core of the draft communicates news or an update.",
    reasoning: "The post mainly communicates news or an update.",
  },
  building_process: {
    criterion:
      "The core of the draft shares progress, decisions, or experiments in ongoing work.",
    reasoning: "The post mainly shares an ongoing building process.",
  },
  substantive_question: {
    criterion:
      "The core of the draft frames a substantive dilemma or question with real trade-offs.",
    reasoning: "The post mainly frames a substantive issue for discussion.",
  },
} as const;

export interface TypeSafeJevV2ClientOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export class TypeSafeJevV2Client implements JevV2Client {
  private readonly client: TypeSafeClient;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: TypeSafeJevV2ClientOptions) {
    this.model = options.model ?? "jev-latest";
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 0;
    this.client = new TypeSafeClient({
      apiKey: options.apiKey,
      defaultModel: this.model,
      logLevel: "off",
      timeout: this.timeoutMs,
      retry: { maxRetries: this.maxRetries },
    });
  }

  async evaluate(content: string): Promise<unknown> {
    const first = await this.client.systemOne(
      {
        state: { platform: "LinkedIn", draft: content },
        questions: buildV2JevQuestions(),
        model: this.model,
      },
      {
        timeout: this.timeoutMs,
        retry: { maxRetries: this.maxRetries },
      },
    );
    const firstChoices = choiceEnvelopeSchema.safeParse(first);
    if (!firstChoices.success) return first;
    const primary = selectedChoice(firstChoices.data.answers[PRIMARY_TYPE_KEY]);
    const secondary = selectedChoice(
      firstChoices.data.answers[SECONDARY_TYPE_KEY],
    );
    if (!isPostType(primary) || secondary !== primary) return first;

    // Independent questions can be batched. A duplicate secondary needs a
    // dependent question with the now-known primary removed from its choices.
    try {
      const followUp = await this.client.systemOne(
        {
          state: { platform: "LinkedIn", draft: content },
          questions: buildSecondaryClarificationQuestions(primary),
          model: this.model,
        },
        {
          timeout: this.timeoutMs,
          retry: { maxRetries: this.maxRetries },
        },
      );
      const parsedFollowUp = choiceEnvelopeSchema.safeParse(followUp);
      const clarified = parsedFollowUp.success
        ? selectedChoice(parsedFollowUp.data.answers[SECONDARY_TYPE_KEY])
        : undefined;
      if (
        clarified === undefined ||
        clarified === primary ||
        (clarified !== "none" && !isPostType(clarified))
      )
        return first;
      const firstEnvelope = responseEnvelopeSchema.safeParse(first);
      const followUpEnvelope = responseEnvelopeSchema.safeParse(followUp);
      if (!firstEnvelope.success || !followUpEnvelope.success) return first;
      return {
        ...firstEnvelope.data,
        answers: {
          ...firstEnvelope.data.answers,
          [SECONDARY_TYPE_KEY]:
            followUpEnvelope.data.answers[SECONDARY_TYPE_KEY],
        },
        usage: {
          input_tokens:
            firstEnvelope.data.usage.input_tokens +
            followUpEnvelope.data.usage.input_tokens,
          output_tokens:
            firstEnvelope.data.usage.output_tokens +
            followUpEnvelope.data.usage.output_tokens,
        },
      };
    } catch {
      // The initial result remains usable; the adapter discards the duplicate.
      return first;
    }
  }
}

const choiceEnvelopeSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

function selectedChoice(answer: unknown): string | undefined {
  return z.object({ choice: z.string() }).safeParse(answer).data?.choice;
}

const responseEnvelopeSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

function isPostType(value: string | undefined): value is PostType {
  return value !== undefined && Object.hasOwn(POST_TYPE_CRITERIA, value);
}

export function buildSecondaryClarificationQuestions(
  primaryType: PostType,
): Record<string, Question> {
  return {
    [SECONDARY_TYPE_KEY]: choice(
      `The draft's primary purpose is ${primaryType.replaceAll("-", " ")}. Which different purpose, if any, is meaningfully developed? Choose none if every other purpose is incidental or merely a call for comments.`,
      Object.fromEntries([
        ["none", "No distinct secondary purpose is meaningfully developed."],
        ...Object.entries(POST_TYPE_CRITERIA).filter(
          ([type]) => type !== primaryType,
        ),
      ]),
    ),
  };
}

export function buildV2JevQuestions(): Record<string, Question> {
  const questions: Record<string, Question> = {};
  for (const dimension of EVALUATION_DIMENSIONS) {
    const criterion = POSTLENS_RUBRIC_V2.dimensions[dimension];
    questions[scoreQuestionKey(dimension)] = score(criterion.question, [
      criterion.levels[0],
      criterion.levels[1],
      criterion.levels[2],
      criterion.levels[3],
      criterion.levels[4],
    ]);
  }

  questions[PRIMARY_TYPE_KEY] = choice(
    "What is this LinkedIn post's dominant communicative purpose? Judge the main work the content does, not emojis, length, first-person language, a question, or an announcement sentence.",
    POST_TYPE_CRITERIA,
  );
  questions[SECONDARY_TYPE_KEY] = choice(
    "Beyond the dominant purpose, is another communicative purpose meaningfully developed in the content? Choose none when another type is incidental, based only on format, or merely a call for comments. Do not repeat the primary type.",
    {
      none: "No distinct secondary purpose is meaningfully developed.",
      ...POST_TYPE_CRITERIA,
    },
  );
  questions[TYPE_EVIDENCE_KEY] = choice(
    "Which feature of the draft best supports its dominant communicative purpose? Judge the substance, not surface formatting.",
    Object.fromEntries(
      Object.entries(CLASSIFICATION_EVIDENCE).map(([key, value]) => [
        key,
        value.criterion,
      ]),
    ),
  );
  return questions;
}
