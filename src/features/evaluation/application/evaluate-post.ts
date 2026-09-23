import type {
  EvaluationDimension,
  PostEvaluation,
} from "../domain/evaluation.types";
import { EVALUATION_DIMENSIONS } from "../domain/evaluation.types";
import { ScoringInputError, scorePost } from "../domain/scoring";
import {
  EvaluatePostError,
  mapPostEvaluatorError,
} from "./evaluate-post.errors";
import {
  countUnicodeCodePoints,
  parseEvaluatePostInput,
} from "./evaluate-post.schema";
import type {
  EvaluationEvent,
  EvaluationObserver,
} from "./evaluation-observer";
import { type PostEvaluator, PostEvaluatorError } from "./post-evaluator";

export interface EvaluatePostResult {
  readonly evaluationId: string;
  readonly evaluation: PostEvaluation;
}

export interface EvaluatePostServiceOptions {
  readonly evaluator: PostEvaluator;
  readonly evaluatorId: string;
  readonly observe?: EvaluationObserver;
  readonly now?: () => number;
  readonly createEvaluationId?: () => string;
}

export class EvaluatePostService {
  private readonly evaluator: PostEvaluator;
  private readonly evaluatorId: string;
  private readonly observer?: EvaluationObserver;
  private readonly now: () => number;
  private readonly createEvaluationId: () => string;

  constructor(options: EvaluatePostServiceOptions) {
    this.evaluator = options.evaluator;
    this.evaluatorId = options.evaluatorId;
    this.observer = options.observe;
    this.now = options.now ?? (() => performance.now());
    this.createEvaluationId =
      options.createEvaluationId ?? (() => crypto.randomUUID());
  }

  async execute(input: unknown): Promise<EvaluatePostResult> {
    const evaluationId = this.createEvaluationId();
    const startedAt = this.now();
    let characterCount: number | undefined;
    let evaluatorStartedAt: number | undefined;
    let evaluatorDurationMs: number | undefined;

    try {
      const parsedInput = parseEvaluatePostInput(input);
      characterCount = countUnicodeCodePoints(parsedInput.content);
      evaluatorStartedAt = this.now();
      const judgments = await this.evaluator.evaluate(parsedInput);
      evaluatorDurationMs = elapsed(this.now(), evaluatorStartedAt);
      const evaluation = scorePost(judgments);
      const totalDurationMs = elapsed(this.now(), startedAt);

      this.notify({
        type: "evaluation.succeeded",
        timestamp: new Date().toISOString(),
        evaluationId,
        evaluatorId: this.evaluatorId,
        characterCount,
        evaluatorDurationMs,
        totalDurationMs,
        rubric: evaluation.rubric,
        contentType: evaluation.contentType,
        dimensionScores: Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [
            dimension,
            evaluation.dimensions[dimension].score,
          ]),
        ) as Readonly<
          Record<
            EvaluationDimension,
            PostEvaluation["dimensions"][EvaluationDimension]["score"]
          >
        >,
        overallScore: evaluation.overallScore,
      });

      return { evaluationId, evaluation };
    } catch (error) {
      if (
        evaluatorStartedAt !== undefined &&
        evaluatorDurationMs === undefined
      ) {
        evaluatorDurationMs = elapsed(this.now(), evaluatorStartedAt);
      }

      const applicationError =
        toEvaluatePostError(error).withEvaluationId(evaluationId);
      this.notify({
        type: "evaluation.failed",
        timestamp: new Date().toISOString(),
        evaluationId,
        evaluatorId: this.evaluatorId,
        totalDurationMs: elapsed(this.now(), startedAt),
        errorCode: applicationError.code,
        ...(characterCount === undefined ? {} : { characterCount }),
        ...(evaluatorDurationMs === undefined ? {} : { evaluatorDurationMs }),
      });
      throw applicationError;
    }
  }

  private notify(event: EvaluationEvent): void {
    try {
      this.observer?.observe(event);
    } catch {
      // Operational reporting must never alter the evaluation result.
    }
  }
}

function elapsed(completedAt: number, startedAt: number): number {
  return Math.max(0, completedAt - startedAt);
}

function toEvaluatePostError(error: unknown): EvaluatePostError {
  if (error instanceof EvaluatePostError) {
    return error;
  }

  if (error instanceof PostEvaluatorError) {
    return mapPostEvaluatorError(error);
  }

  if (error instanceof ScoringInputError) {
    return new EvaluatePostError("INTERNAL_ERROR");
  }

  return new EvaluatePostError("INTERNAL_ERROR");
}
