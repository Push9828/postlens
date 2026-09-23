import {
  type ChoiceCriteria,
  choice,
  type Question,
  score,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
} from "../../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../../domain/rubric";
import {
  getJevReasonKey,
  getJevScoreKey,
  JEV_CONTENT_TYPE_KEY,
  type JevClientRequest,
  type JevDecisionClient,
} from "./jev.types";
import { JEV_REASON_DEFINITIONS } from "./jev-reasons";

const CONTENT_TYPE_CRITERIA = {
  educational: "Explains or teaches a concept, method, or lesson.",
  story: "Uses a narrative or sequence of events as the main structure.",
  opinion: "Argues for a perspective or point of view.",
  "case-study": "Examines a concrete situation, intervention, and result.",
  reflection: "Reflects on an experience, change, or lesson learned.",
  announcement: "Primarily announces news, a launch, or an update.",
  "build-in-public":
    "Shares ongoing progress, decisions, or setbacks while building.",
  other: "Does not primarily fit the other available content types.",
} as const satisfies ChoiceCriteria;

export interface TypeSafeJevClientOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export class TypeSafeJevClient implements JevDecisionClient {
  private readonly client: TypeSafeClient;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: TypeSafeJevClientOptions) {
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

  async evaluate(request: JevClientRequest): Promise<unknown> {
    return this.client.systemOne(
      {
        state: {
          platform: "LinkedIn",
          draft: request.content,
        },
        questions: buildJevQuestions(request.explanationMode),
        model: this.model,
      },
      {
        timeout: this.timeoutMs,
        retry: { maxRetries: this.maxRetries },
      },
    );
  }
}

export function buildJevQuestions(
  explanationMode: JevClientRequest["explanationMode"],
): Record<string, Question> {
  const questions: Record<string, Question> = {};

  for (const dimension of EVALUATION_DIMENSIONS) {
    const rubric = POSTLENS_RUBRIC.dimensions[dimension];
    const criteria = EVALUATION_LEVELS.map((level) => rubric.levels[level]) as [
      string,
      string,
      string,
      string,
      string,
    ];

    questions[getJevScoreKey(dimension)] = score(rubric.question, criteria);

    if (explanationMode === "reason-code") {
      const reasonCriteria = Object.fromEntries(
        Object.entries(JEV_REASON_DEFINITIONS[dimension]).map(
          ([code, definition]) => [code, definition.criterion],
        ),
      );
      questions[getJevReasonKey(dimension)] = choice(
        `Which observation best explains the ${rubric.label} judgment for this draft?`,
        reasonCriteria,
      );
    }
  }

  questions[JEV_CONTENT_TYPE_KEY] = choice(
    "Which content type best describes this LinkedIn draft?",
    Object.fromEntries(
      CONTENT_TYPES.map((contentType) => [
        contentType,
        CONTENT_TYPE_CRITERIA[contentType],
      ]),
    ),
  );

  return questions;
}
