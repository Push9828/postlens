import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../../evaluation/application/evaluate-post.limits";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
} from "../../evaluation/domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../../evaluation/domain/rubric";
import {
  type ImprovementAction,
  introducesFactualAnchors,
  replaceParagraph,
  selectParagraph,
  selectWeakestDimensions,
} from "../domain/improvement";
import { ImprovementError, mapImproverError } from "./improvement-error";
import { parseImprovementRequest } from "./improvement-request";
import {
  type ImprovementContext,
  type PostImprover,
  PostImproverError,
} from "./post-improver";

export interface VerifiedScores {
  readonly originalScore: number;
  readonly revisedScore: number;
  readonly overallDelta: number;
  readonly dimensionDeltas: Readonly<Record<EvaluationDimension, number>>;
}

export type ImprovementResult =
  | {
      readonly improvementId: string;
      readonly status: "suggested";
      readonly action: ImprovementAction;
      readonly revisedText: string;
      readonly focusDimensions: readonly EvaluationDimension[];
      readonly target?: "hook" | "ending";
      readonly changeNote: string;
      readonly reviewRequired: true;
      readonly verification?: VerifiedScores;
    }
  | {
      readonly improvementId: string;
      readonly status: "no-safe-change";
      readonly action: ImprovementAction;
      readonly reason: string;
    };

export interface ImprovementEvent {
  readonly improvementId: string;
  readonly evaluationId?: string;
  readonly action?: ImprovementAction;
  readonly characterCount?: number;
  readonly status: "suggested" | "no-safe-change" | "failed";
  readonly errorCode?: string;
  readonly providerDurationMs?: number;
  readonly totalDurationMs: number;
}

export class ImprovePostService {
  constructor(
    private readonly improver: PostImprover,
    private readonly observe?: (event: ImprovementEvent) => void,
    private readonly now: () => number = () => performance.now(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: unknown): Promise<ImprovementResult> {
    const improvementId = this.createId();
    const startedAt = this.now();
    let providerDurationMs: number | undefined;
    let request: ReturnType<typeof parseImprovementRequest> | undefined;
    try {
      request = parseImprovementRequest(input);
      const { content, action, evaluation } = request;
      const focusKeys: readonly EvaluationDimension[] =
        action === "weakest-areas" || action === "whole-post"
          ? selectWeakestDimensions(evaluation)
          : action === "hook"
            ? ["hook"]
            : action === "ending"
              ? ["clarity", "discussionPotential"]
              : [evaluation.weakestDimension];
      const target =
        action === "hook" || action === "ending"
          ? selectParagraph(content, action)
          : undefined;
      const providerStartedAt = this.now();
      const output = await this.improver.improve({
        content,
        action,
        rubric: evaluation.rubric,
        contentType: evaluation.contentType,
        overallScore: evaluation.overallScore,
        dimensions: Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [
            dimension,
            {
              level: evaluation.dimensions[dimension].level,
              score: evaluation.dimensions[dimension].score,
              explanation: evaluation.dimensions[dimension].explanation,
              criterion: POSTLENS_RUBRIC.dimensions[dimension],
            },
          ]),
        ) as ImprovementContext["dimensions"],
        strongestDimension: evaluation.strongestDimension,
        weakestDimension: evaluation.weakestDimension,
        focus: focusKeys.map((dimension) => ({
          dimension,
          level: evaluation.dimensions[dimension].level,
          explanation: evaluation.dimensions[dimension].explanation,
        })),
        ...(target ? { targetText: target.text } : {}),
      });
      providerDurationMs = Math.max(0, this.now() - providerStartedAt);
      if (output.status === "no-safe-change") {
        if (!output.reason.trim() || output.reason.length > 240)
          throw new ImprovementError("IMPROVEMENT_FAILED");
        const result: ImprovementResult = {
          improvementId,
          status: "no-safe-change",
          action,
          reason: output.reason.trim(),
        };
        this.notify({
          improvementId,
          evaluationId: request.evaluationId,
          action,
          characterCount: countUnicodeCodePoints(content),
          status: result.status,
          providerDurationMs,
          totalDurationMs: Math.max(0, this.now() - startedAt),
        });
        return result;
      }
      if (
        output.status !== "suggested" ||
        !output.text?.trim() ||
        !output.changeNote?.trim() ||
        output.changeNote.length > 240
      )
        throw new ImprovementError("IMPROVEMENT_FAILED");
      const replacement = output.text.trim();
      if (target && /\n\s*\n/.test(replacement))
        throw new ImprovementError("UNSAFE_SUGGESTION");
      const revisedText = target
        ? replaceParagraph(content, target, replacement)
        : replacement;
      const length = countUnicodeCodePoints(revisedText);
      if (
        length < MIN_POST_CHARACTERS ||
        length > MAX_POST_CHARACTERS ||
        revisedText === content ||
        introducesFactualAnchors(content, revisedText)
      )
        throw new ImprovementError("UNSAFE_SUGGESTION");
      const result: ImprovementResult = {
        improvementId,
        status: "suggested",
        action,
        revisedText,
        focusDimensions: focusKeys,
        ...(target ? { target: action as "hook" | "ending" } : {}),
        changeNote: output.changeNote.trim(),
        reviewRequired: true,
      };
      this.notify({
        improvementId,
        evaluationId: request.evaluationId,
        action,
        characterCount: countUnicodeCodePoints(content),
        status: result.status,
        providerDurationMs,
        totalDurationMs: Math.max(0, this.now() - startedAt),
      });
      return result;
    } catch (error) {
      const safeError =
        error instanceof ImprovementError
          ? error
          : error instanceof PostImproverError
            ? mapImproverError(error.kind)
            : new ImprovementError("INTERNAL_ERROR");
      this.notify({
        improvementId,
        evaluationId: request?.evaluationId,
        action: request?.action,
        characterCount: request
          ? countUnicodeCodePoints(request.content)
          : undefined,
        status: "failed",
        errorCode: safeError.code,
        providerDurationMs,
        totalDurationMs: Math.max(0, this.now() - startedAt),
      });
      throw safeError;
    }
  }

  private notify(event: ImprovementEvent): void {
    try {
      this.observe?.(event);
    } catch {
      /* telemetry must not change the result */
    }
  }
}
