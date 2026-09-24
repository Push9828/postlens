import { z } from "zod";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../../evaluation/application/evaluate-post.limits";
import type { V2EvaluatePostResult } from "../../evaluation/v2/evaluate-post";
import { v2EvaluationSchema } from "../../evaluation/v2/evaluation.schema";
import { isConsistentV2Evaluation } from "../../evaluation/v2/resolve-evaluation";
import { POSTLENS_RUBRIC_V2 } from "../../evaluation/v2/rubric";
import { calculatePostScores } from "../../evaluation/v2/scoring";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  RUBRIC_VERSION,
} from "../../evaluation/v2/types";
import {
  ImprovementError,
  mapImproverError,
} from "../application/improvement-error";
import { V2ImproverError } from "./provider-error";
import { introducesFactualAnchors } from "./safety";

const requestSchema = z.strictObject({
  content: z.string(),
  action: z.literal("whole-post"),
  evaluationId: z.uuid(),
  evaluation: z.unknown(),
});

export type V2ImprovementResult =
  | {
      readonly improvementId: string;
      readonly status: "suggested";
      readonly revisedText: string;
      readonly changeNote: string;
      readonly reviewRequired: true;
      readonly verification: {
        readonly rubricVersion: typeof RUBRIC_VERSION;
        readonly originalQuality: number;
        readonly revisedQuality: number;
        readonly qualityDelta: number;
        readonly originalEngagement: number;
        readonly revisedEngagement: number;
        readonly engagementDelta: number;
        readonly dimensionDeltas: Readonly<Record<EvaluationDimension, number>>;
      };
    }
  | {
      readonly improvementId: string;
      readonly status: "no-safe-change";
      readonly reason: string;
    };

export interface V2ImprovementContext {
  readonly content: string;
  readonly evaluation: V2EvaluatePostResult["evaluation"];
  readonly focus: readonly EvaluationDimension[];
  readonly rubric: typeof POSTLENS_RUBRIC_V2;
}

export class V2ImprovePostService {
  constructor(
    private readonly generator: {
      improve(
        context: V2ImprovementContext,
      ): Promise<
        | { status: "suggested"; text: string; changeNote: string }
        | { status: "no-safe-change"; reason: string }
      >;
    },
    private readonly evaluator: {
      execute(input: unknown): Promise<V2EvaluatePostResult>;
    },
    private readonly observe?: (event: Record<string, unknown>) => void,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: unknown): Promise<V2ImprovementResult> {
    const improvementId = this.createId();
    const startedAt = performance.now();
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new ImprovementError("INVALID_REQUEST");
    const content = parsed.data.content.trim();
    const length = countUnicodeCodePoints(content);
    if (length < MIN_POST_CHARACTERS)
      throw new ImprovementError("POST_TOO_SHORT");
    if (length > MAX_POST_CHARACTERS)
      throw new ImprovementError("POST_TOO_LONG");
    const candidate = parsed.data.evaluation;
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      "rubricVersion" in candidate &&
      candidate.rubricVersion !== RUBRIC_VERSION
    )
      throw new ImprovementError("STALE_RUBRIC");
    const snapshotResult = v2EvaluationSchema.safeParse(candidate);
    if (!snapshotResult.success) throw new ImprovementError("INVALID_REQUEST");
    const snapshot = snapshotResult.data;
    if (!isConsistentV2Evaluation(snapshot))
      throw new ImprovementError("INVALID_REQUEST");
    const focus = [...EVALUATION_DIMENSIONS]
      .sort((a, b) => snapshot.dimensionScores[a] - snapshot.dimensionScores[b])
      .slice(0, 2);

    let output: Awaited<ReturnType<typeof this.generator.improve>>;
    const generatorStartedAt = performance.now();
    try {
      output = await this.generator.improve({
        content,
        evaluation: snapshot,
        focus,
        rubric: POSTLENS_RUBRIC_V2,
      });
    } catch (error) {
      throw error instanceof V2ImproverError
        ? mapImproverError(error.kind)
        : new ImprovementError("INTERNAL_ERROR");
    }
    const generatorDurationMs = Math.max(
      0,
      performance.now() - generatorStartedAt,
    );
    if (output.status === "no-safe-change") {
      if (!output.reason.trim() || output.reason.length > 240)
        throw new ImprovementError("IMPROVEMENT_FAILED");
      this.notify({
        improvementId,
        evaluationId: parsed.data.evaluationId,
        outcome: "no-safe-change",
        rubricVersion: RUBRIC_VERSION,
        generatorDurationMs,
        totalDurationMs: performance.now() - startedAt,
      });
      return {
        improvementId,
        status: "no-safe-change",
        reason: output.reason.trim(),
      };
    }
    const revisedText = output.text.trim();
    if (
      !revisedText ||
      !output.changeNote.trim() ||
      output.changeNote.length > 240
    )
      throw new ImprovementError("IMPROVEMENT_FAILED");
    const revisedLength = countUnicodeCodePoints(revisedText);
    if (
      revisedLength < MIN_POST_CHARACTERS ||
      revisedLength > MAX_POST_CHARACTERS ||
      revisedText === content ||
      introducesFactualAnchors(content, revisedText)
    )
      throw new ImprovementError("UNSAFE_SUGGESTION");

    const evaluations = await Promise.allSettled([
      this.evaluator.execute({ content }),
      this.evaluator.execute({ content: revisedText }),
    ]);
    if (
      evaluations[0].status !== "fulfilled" ||
      evaluations[1].status !== "fulfilled"
    )
      throw new ImprovementError("IMPROVEMENT_UNAVAILABLE");
    const original = evaluations[0].value.evaluation;
    const revised = evaluations[1].value.evaluation;
    // The original snapshot fixes the profile, even if the fresh classifications differ.
    const profile = snapshot.resolvedProfile;
    const originalScores = calculatePostScores(
      original.dimensionScores,
      profile,
    );
    const revisedScores = calculatePostScores(revised.dimensionScores, profile);
    const qualityDelta =
      revisedScores.contentQuality - originalScores.contentQuality;
    const engagementDelta =
      revisedScores.engagementPotential - originalScores.engagementPotential;
    const dimensionDeltas = Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        revised.dimensionScores[dimension] -
          original.dimensionScores[dimension],
      ]),
    ) as Record<EvaluationDimension, number>;
    const rejection = v2ImprovementRejection({
      qualityDelta,
      engagementDelta,
      dimensionDeltas,
      focus,
    });
    const accepted = rejection === undefined;
    this.notify({
      improvementId,
      evaluationId: parsed.data.evaluationId,
      outcome: accepted ? "accepted" : "rejected",
      ...(rejection ? { rejectionReason: rejection } : {}),
      rubricVersion: RUBRIC_VERSION,
      resolutionSource: profile.source,
      originalQuality: originalScores.contentQuality,
      revisedQuality: revisedScores.contentQuality,
      originalEngagement: originalScores.engagementPotential,
      revisedEngagement: revisedScores.engagementPotential,
      qualityDelta,
      engagementDelta,
      dimensionDeltas,
      generatorDurationMs,
      totalDurationMs: Math.max(0, performance.now() - startedAt),
    });
    if (!accepted)
      return {
        improvementId,
        status: "no-safe-change",
        reason:
          rejection === "insufficient-quality"
            ? `The revision gained ${qualityDelta.toFixed(1)} Content Quality points in this check; at least 3 are required. Try again or revise it yourself.`
            : rejection === "focus-unchanged"
              ? "Content Quality rose, but neither focus dimension improved in this check. Try again or revise it yourself."
              : rejection === "dimension-regression"
                ? "Content Quality rose, but the revision weakened too many dimensions in this check. Try again or revise it yourself."
                : "Content Quality rose, but Engagement Potential fell by more than 10 points in this check. Try again or revise it yourself.",
      };
    return {
      improvementId,
      status: "suggested",
      revisedText,
      changeNote: output.changeNote.trim(),
      reviewRequired: true,
      verification: {
        rubricVersion: RUBRIC_VERSION,
        originalQuality: originalScores.contentQuality,
        revisedQuality: revisedScores.contentQuality,
        qualityDelta,
        originalEngagement: originalScores.engagementPotential,
        revisedEngagement: revisedScores.engagementPotential,
        engagementDelta,
        dimensionDeltas,
      },
    };
  }

  private notify(event: Record<string, unknown>) {
    try {
      this.observe?.({
        type: "improvement.v2",
        timestamp: new Date().toISOString(),
        ...event,
      });
    } catch {
      /* telemetry cannot change the result */
    }
  }
}

export function passesV2ImprovementGate(input: {
  readonly qualityDelta: number;
  readonly engagementDelta: number;
  readonly dimensionDeltas: Readonly<Record<EvaluationDimension, number>>;
  readonly focus: readonly EvaluationDimension[];
}): boolean {
  return v2ImprovementRejection(input) === undefined;
}

function v2ImprovementRejection(input: {
  readonly qualityDelta: number;
  readonly engagementDelta: number;
  readonly dimensionDeltas: Readonly<Record<EvaluationDimension, number>>;
  readonly focus: readonly EvaluationDimension[];
}):
  | "insufficient-quality"
  | "focus-unchanged"
  | "dimension-regression"
  | "engagement-regression"
  | undefined {
  if (input.qualityDelta < 3) return "insufficient-quality";
  if (!input.focus.some((dimension) => input.dimensionDeltas[dimension] > 0))
    return "focus-unchanged";
  const regressions = EVALUATION_DIMENSIONS.filter(
    (dimension) => input.dimensionDeltas[dimension] < 0,
  );
  if (
    regressions.length > 1 ||
    regressions.some((dimension) => input.dimensionDeltas[dimension] < -25)
  )
    return "dimension-regression";
  if (input.engagementDelta < -10) return "engagement-regression";
  return undefined;
}
