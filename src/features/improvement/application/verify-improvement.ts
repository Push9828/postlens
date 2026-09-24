import type { ComparePostsResult } from "../../evaluation/application/compare-posts";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import type { ImprovementResult, VerifiedScores } from "./improve-post";
import { ImprovementError } from "./improvement-error";
import { parseImprovementRequest } from "./improvement-request";

export type VerifiedImprovementResult =
  | Extract<ImprovementResult, { status: "no-safe-change" }>
  | (Extract<ImprovementResult, { status: "suggested" }> & {
      readonly verification: VerifiedScores;
    });

interface Improver {
  execute(input: unknown): Promise<ImprovementResult>;
}

interface Comparer {
  execute(input: unknown): Promise<ComparePostsResult>;
}

interface ImprovementVerificationEvent {
  readonly improvementId: string;
  readonly outcome: "accepted" | "rejected" | "unavailable";
  readonly rejectionReason?:
    | "insufficient-gain"
    | "focus-unchanged"
    | "regression";
  readonly originalScore?: number;
  readonly revisedScore?: number;
  readonly overallDelta?: number;
  readonly dimensionDeltas?: VerifiedScores["dimensionDeltas"];
  readonly totalDurationMs: number;
}

export class VerifyImprovementService {
  constructor(
    private readonly improver: Improver,
    private readonly comparer: Comparer,
    private readonly observe?: (event: ImprovementVerificationEvent) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  async execute(input: unknown): Promise<VerifiedImprovementResult> {
    const startedAt = this.now();
    const result = await this.improver.execute(input);
    if (result.status === "no-safe-change") return result;

    const request = parseImprovementRequest(input);
    let compared: ComparePostsResult;
    try {
      compared = await this.comparer.execute({
        versionA: request.content,
        versionB: result.revisedText,
      });
    } catch {
      this.notify({
        improvementId: result.improvementId,
        outcome: "unavailable",
        totalDurationMs: Math.max(0, this.now() - startedAt),
      });
      throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
    }
    if (compared.status !== "complete") {
      this.notify({
        improvementId: result.improvementId,
        outcome: "unavailable",
        totalDurationMs: Math.max(0, this.now() - startedAt),
      });
      throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
    }

    const originalScore = compared.versions.A.evaluation.overallScore;
    const revisedScore = compared.versions.B.evaluation.overallScore;
    const { overallDelta, dimensionDeltas } = compared.comparison;
    const focusedGain =
      result.action === "whole-post"
        ? EVALUATION_DIMENSIONS.some(
            (dimension) => dimensionDeltas[dimension] > 0,
          )
        : result.focusDimensions.some(
            (dimension) => dimensionDeltas[dimension] > 0,
          );
    const regressions = EVALUATION_DIMENSIONS.filter(
      (dimension) => dimensionDeltas[dimension] < 0,
    );
    const rejectionReason =
      overallDelta < 3
        ? "insufficient-gain"
        : !focusedGain
          ? "focus-unchanged"
          : regressions.length > 1 ||
              regressions.some((dimension) => dimensionDeltas[dimension] < -25)
            ? "regression"
            : undefined;
    if (rejectionReason) {
      this.notify({
        improvementId: result.improvementId,
        outcome: "rejected",
        rejectionReason,
        originalScore,
        revisedScore,
        overallDelta,
        dimensionDeltas,
        totalDurationMs: Math.max(0, this.now() - startedAt),
      });
      return {
        improvementId: result.improvementId,
        action: result.action,
        status: "no-safe-change",
        reason:
          rejectionReason === "insufficient-gain"
            ? `The proposed revision scored ${revisedScore} versus ${originalScore} for the original in this check. Try again for a different revision.`
            : rejectionReason === "focus-unchanged"
              ? "The overall score rose, but the requested focus did not improve. Try again for a different revision."
              : "The overall score rose, but the revision weakened multiple rubric dimensions. Try again for a more balanced version.",
      };
    }

    this.notify({
      improvementId: result.improvementId,
      outcome: "accepted",
      originalScore,
      revisedScore,
      overallDelta,
      dimensionDeltas,
      totalDurationMs: Math.max(0, this.now() - startedAt),
    });
    return {
      ...result,
      verification: {
        originalScore,
        revisedScore,
        overallDelta,
        dimensionDeltas,
      },
    };
  }

  private notify(event: ImprovementVerificationEvent): void {
    try {
      this.observe?.(event);
    } catch {
      // Operational reporting must not change the result.
    }
  }
}
