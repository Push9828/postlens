import { EvaluatePostError } from "../application/evaluate-post.errors";
import { countUnicodeCodePoints } from "../application/evaluate-post.limits";
import { parseEvaluatePostInput } from "../application/evaluate-post.schema";
import type { JevV2Judgments } from "./jev/jev.types";
import { V2JevEvaluatorError } from "./jev/jev-error";
import {
  calculatePostScores,
  resolveWeightProfile,
  scoreRawDimensions,
  V2ScoringInputError,
} from "./scoring";
import {
  type CalculatedPostScores,
  type DimensionScores,
  type PostTypeClassification,
  type RawPostEvaluation,
  type ResolvedWeightProfile,
  RUBRIC_VERSION,
} from "./types";

export interface V2PostEvaluation {
  readonly rubricVersion: typeof RUBRIC_VERSION;
  readonly detectedClassification: PostTypeClassification;
  readonly rawEvaluation: RawPostEvaluation;
  readonly dimensionScores: DimensionScores;
  readonly resolvedProfile: ResolvedWeightProfile;
  readonly scores: CalculatedPostScores;
}

export interface V2EvaluatePostResult {
  readonly evaluationId: string;
  readonly evaluation: V2PostEvaluation;
}

export type V2EvaluationEvent =
  | {
      readonly type: "evaluation.v2.succeeded";
      readonly timestamp: string;
      readonly evaluationId: string;
      readonly evaluatorId: string;
      readonly rubricVersion: typeof RUBRIC_VERSION;
      readonly characterCount: number;
      readonly evaluatorDurationMs: number;
      readonly totalDurationMs: number;
      readonly primaryPostType: PostTypeClassification["primaryType"];
      readonly secondaryPostType?: PostTypeClassification["secondaryType"];
      readonly classificationConfidence: number;
      readonly resolutionSource: ResolvedWeightProfile["source"];
      readonly contentQuality: number;
      readonly engagementPotential: number;
    }
  | {
      readonly type: "evaluation.v2.failed";
      readonly timestamp: string;
      readonly evaluationId: string;
      readonly evaluatorId: string;
      readonly rubricVersion: typeof RUBRIC_VERSION;
      readonly errorCode: EvaluatePostError["code"];
      readonly totalDurationMs: number;
      readonly characterCount?: number;
      readonly evaluatorDurationMs?: number;
    };

export interface V2EvaluatePostOptions {
  readonly evaluator: { evaluate(content: string): Promise<JevV2Judgments> };
  readonly evaluatorId: string;
  readonly observe?: (event: V2EvaluationEvent) => void;
  readonly now?: () => number;
  readonly createEvaluationId?: () => string;
}

/** Application scoring is independent of the Jev adapter and its SDK types. */
export class V2EvaluatePostService {
  constructor(private readonly options: V2EvaluatePostOptions) {}

  async execute(input: unknown): Promise<V2EvaluatePostResult> {
    const evaluationId =
      this.options.createEvaluationId?.() ?? crypto.randomUUID();
    const now = this.options.now ?? (() => performance.now());
    const startedAt = now();
    let characterCount: number | undefined;
    let evaluatorStartedAt: number | undefined;
    let evaluatorDurationMs: number | undefined;

    try {
      const { content } = parseEvaluatePostInput(input);
      characterCount = countUnicodeCodePoints(content);
      evaluatorStartedAt = now();
      const { classification, rawEvaluation } =
        await this.options.evaluator.evaluate(content);
      evaluatorDurationMs = Math.max(0, now() - evaluatorStartedAt);
      const dimensionScores = scoreRawDimensions(rawEvaluation);
      const resolvedProfile = resolveWeightProfile(classification);
      const scores = calculatePostScores(dimensionScores, resolvedProfile);
      const evaluation: V2PostEvaluation = {
        rubricVersion: RUBRIC_VERSION,
        detectedClassification: classification,
        rawEvaluation,
        dimensionScores,
        resolvedProfile,
        scores,
      };
      this.notify({
        type: "evaluation.v2.succeeded",
        timestamp: new Date().toISOString(),
        evaluationId,
        evaluatorId: this.options.evaluatorId,
        rubricVersion: RUBRIC_VERSION,
        characterCount,
        evaluatorDurationMs,
        totalDurationMs: Math.max(0, now() - startedAt),
        primaryPostType: classification.primaryType,
        ...(classification.secondaryType === undefined
          ? {}
          : { secondaryPostType: classification.secondaryType }),
        classificationConfidence: classification.confidence,
        resolutionSource: resolvedProfile.source,
        contentQuality: scores.contentQuality,
        engagementPotential: scores.engagementPotential,
      });
      return { evaluationId, evaluation };
    } catch (error) {
      if (evaluatorStartedAt !== undefined && evaluatorDurationMs === undefined)
        evaluatorDurationMs = Math.max(0, now() - evaluatorStartedAt);
      const applicationError = mapV2Error(error).withEvaluationId(evaluationId);
      this.notify({
        type: "evaluation.v2.failed",
        timestamp: new Date().toISOString(),
        evaluationId,
        evaluatorId: this.options.evaluatorId,
        rubricVersion: RUBRIC_VERSION,
        errorCode: applicationError.code,
        totalDurationMs: Math.max(0, now() - startedAt),
        ...(characterCount === undefined ? {} : { characterCount }),
        ...(evaluatorDurationMs === undefined ? {} : { evaluatorDurationMs }),
      });
      throw applicationError;
    }
  }

  private notify(event: V2EvaluationEvent): void {
    try {
      this.options.observe?.(event);
    } catch {
      // Telemetry must not change evaluation behavior.
    }
  }
}

function mapV2Error(error: unknown): EvaluatePostError {
  if (error instanceof EvaluatePostError) return error;
  if (error instanceof V2JevEvaluatorError) {
    const code = {
      configuration: "EVALUATION_UNAVAILABLE",
      authentication: "EVALUATION_UNAVAILABLE",
      "rate-limit": "EVALUATION_BUSY",
      timeout: "EVALUATION_TIMEOUT",
      aborted: "EVALUATION_FAILED",
      unavailable: "EVALUATION_UNAVAILABLE",
      "invalid-response": "EVALUATION_FAILED",
      unexpected: "INTERNAL_ERROR",
    } as const;
    return new EvaluatePostError(
      code[error.kind],
      error.kind === "configuration" || error.kind === "authentication"
        ? false
        : undefined,
    );
  }
  if (error instanceof V2ScoringInputError)
    return new EvaluatePostError("INTERNAL_ERROR");
  return new EvaluatePostError("INTERNAL_ERROR");
}
