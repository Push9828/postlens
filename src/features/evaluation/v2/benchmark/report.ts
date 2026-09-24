import { createHash } from "node:crypto";
import { RUBRIC_VERSION } from "../types";
import { summarizeV2Benchmark } from "./metrics";
import type {
  V2BenchmarkAttempt,
  V2BenchmarkConditions,
  V2BenchmarkReport,
} from "./types";

export interface V2BenchmarkFixture {
  readonly id: string;
  readonly category: string;
  readonly content: string;
}

export interface V2BenchmarkPlan {
  readonly datasetVersion: string;
  readonly createdAt: string;
  readonly codeRevision: string;
  readonly requestedModel: string;
  readonly timeoutMs: number;
  readonly fixtureIds: readonly string[];
  readonly repetitions: number;
}

export function createV2BenchmarkConditions(
  fixtures: readonly V2BenchmarkFixture[],
  plan: V2BenchmarkPlan,
  completedAt = new Date().toISOString(),
): V2BenchmarkConditions {
  if (plan.fixtureIds.length === 0 || plan.repetitions < 1)
    throw new Error("V2 benchmark plan requires fixtures and repetitions.");
  if (new Set(plan.fixtureIds).size !== plan.fixtureIds.length)
    throw new Error("V2 benchmark fixture IDs must be unique.");
  const selected = plan.fixtureIds.map((id) => {
    const fixture = fixtures.find((item) => item.id === id);
    if (!fixture) throw new Error(`Unknown V2 benchmark fixture: ${id}`);
    return {
      id,
      category: fixture.category,
      characterCount: Array.from(fixture.content).length,
      contentHash: sha256(fixture.content),
    };
  });
  const datasetHash = sha256(
    JSON.stringify({ version: plan.datasetVersion, selected }),
  );
  return {
    schemaVersion: 1,
    rubricVersion: RUBRIC_VERSION,
    datasetVersion: plan.datasetVersion,
    datasetHash,
    fixtures: selected,
    createdAt: plan.createdAt,
    completedAt,
    codeRevision: plan.codeRevision,
    requestedModel: plan.requestedModel,
    timeoutMs: plan.timeoutMs,
    retries: 0,
    fixtureIds: plan.fixtureIds,
    repetitions: plan.repetitions,
    scheduledAttempts: plan.fixtureIds.length * plan.repetitions,
    completedAttempts: 0,
  };
}

export function createV2BenchmarkReport(
  conditions: V2BenchmarkConditions,
  attempts: readonly V2BenchmarkAttempt[],
  completedAt = new Date().toISOString(),
): V2BenchmarkReport {
  const seen = new Set<string>();
  for (const attempt of attempts) {
    if (seen.has(attempt.key))
      throw new Error(`Duplicate V2 attempt key: ${attempt.key}`);
    seen.add(attempt.key);
    if (!conditions.fixtureIds.includes(attempt.fixtureId))
      throw new Error(
        `Attempt references an unplanned fixture: ${attempt.fixtureId}`,
      );
    if (attempt.repetition > conditions.repetitions)
      throw new Error(`Attempt exceeds planned repetitions: ${attempt.key}`);
  }
  const finalizedConditions = {
    ...conditions,
    completedAt,
    completedAttempts: attempts.length,
  };
  return {
    conditions: finalizedConditions,
    attempts,
    summary: summarizeV2Benchmark(attempts),
  };
}

export function renderV2BenchmarkMarkdown(report: V2BenchmarkReport): string {
  const { conditions: c, summary: s } = report;
  const dimensionRows = Object.entries(s.dimensionMeans).map(
    ([dimension, value]) => `| ${dimension} | ${format(value)} |`,
  );
  const typeRows = Object.entries(s.primaryTypeCounts).map(
    ([type, count]) => `| ${type} | ${count} |`,
  );
  return [
    "# PostLens Rubric V2 evaluation report",
    "",
    `Rubric: ${c.rubricVersion}; dataset: ${c.datasetVersion} (${c.datasetHash})`,
    `Created: ${c.createdAt}; completed: ${c.completedAt}`,
    `Code revision: ${c.codeRevision}; requested model: ${c.requestedModel}; timeout: ${c.timeoutMs} ms; retries: ${c.retries}`,
    `Fixtures: ${c.fixtureIds.length}; repetitions: ${c.repetitions}; attempts: ${c.completedAttempts}/${c.scheduledAttempts}`,
    `Fixture manifest: ${c.fixtures.map((fixture) => `${fixture.id} [${fixture.category}, ${fixture.characterCount} chars, sha256 ${fixture.contentHash}]`).join("; ")}`,
    "",
    "## Evaluation outcomes",
    "",
    `Successes: ${s.successes}; failures: ${s.failures}; failure rate: ${formatPercent(s.failureRate)}`,
    `Evaluator latency for successful calls: p50 ${format(s.latencyMs.successfulP50)} ms, p95 ${format(s.latencyMs.successfulP95)} ms (${s.latencyMs.successfulCount} samples). Failed-call latency: p50 ${format(s.latencyMs.failedP50)} ms, p95 ${format(s.latencyMs.failedP95)} ms (${s.latencyMs.failedCount} samples).`,
    `Mean Content Quality: ${format(s.meanContentQuality)}`,
    `Mean Engagement Potential: ${format(s.meanEngagementPotential)}`,
    `Mean Content Quality minus Engagement Potential: ${format(s.meanQualityMinusEngagement)}`,
    `Content Quality score distribution (min / p25 / median / p75 / max): ${format(s.scoreDistribution.contentQuality.min)} / ${format(s.scoreDistribution.contentQuality.p25)} / ${format(s.scoreDistribution.contentQuality.median)} / ${format(s.scoreDistribution.contentQuality.p75)} / ${format(s.scoreDistribution.contentQuality.max)}`,
    `Engagement Potential score distribution (min / p25 / median / p75 / max): ${format(s.scoreDistribution.engagementPotential.min)} / ${format(s.scoreDistribution.engagementPotential.p25)} / ${format(s.scoreDistribution.engagementPotential.median)} / ${format(s.scoreDistribution.engagementPotential.p75)} / ${format(s.scoreDistribution.engagementPotential.max)}`,
    `Recorded token usage: ${s.tokenUsage.inputTokens} input, ${s.tokenUsage.outputTokens} output; missing usage: ${s.tokenUsage.missingCount}. Cost is not estimated because no current price assumption is attached to this Jev run.`,
    "",
    "## Classifications",
    "",
    `Mean confidence: ${format(s.confidence.mean)}; low (<0.55): ${s.confidence.lowCount}; medium (0.55–<0.75): ${s.confidence.mediumCount}; high (>=0.75): ${s.confidence.highCount}`,
    "",
    "| Primary type | Count |",
    "| --- | ---: |",
    ...typeRows,
    ...(typeRows.length ? [] : ["| No successful classifications | 0 |"]),
    "",
    `Secondary type counts: ${JSON.stringify(s.secondaryTypeCounts)}`,
    "",
    "## Raw dimension means",
    "",
    "| Dimension | Mean normalized score |",
    "| --- | ---: |",
    ...dimensionRows,
    "",
    "| Dimension | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(s.dimensionLevelCounts).map(
      ([dimension, levels]) =>
        `| ${dimension} | ${levels[0]} | ${levels[1]} | ${levels[2]} | ${levels[3]} | ${levels[4]} |`,
    ),
    "",
    "## Repeatability",
    "",
    `Fixtures with repeats: ${s.repeatability.fixtureCount}; primary-type exact agreement: ${formatPercent(s.repeatability.primaryTypeExactRate)}; resolved-profile exact agreement: ${formatPercent(s.repeatability.resolvedProfileExactRate)}; raw-dimension exact agreement: ${formatPercent(s.repeatability.rawDimensionExactRate)}; within-one-level agreement: ${formatPercent(s.repeatability.rawDimensionWithinOneRate)}; mean absolute level difference: ${format(s.repeatability.meanAbsoluteLevelDifference)}.`,
    `Mean absolute repeated-run differences: classification confidence ${format(s.repeatability.meanAbsoluteConfidenceDifference)}; Content Quality ${format(s.repeatability.meanAbsoluteContentQualityDifference)}; Engagement Potential ${format(s.repeatability.meanAbsoluteEngagementPotentialDifference)}.`,
    `Mean within-fixture population variance: Content Quality ${format(s.repeatability.contentQualityMeanWithinFixtureVariance)}; Engagement Potential ${format(s.repeatability.engagementPotentialMeanWithinFixtureVariance)}. Pairwise repeated comparisons are correlated and are not independent drafts.`,
    "",
    "## Failures",
    "",
    `Failure kinds: ${JSON.stringify(s.failureKinds)}`,
    "",
    "## Interpretation limits",
    "",
    "This report describes evaluator behavior on a fixed set of project-owned drafts. It does not establish classification accuracy or score calibration against human judgments; no human labels are included. The scores assess content against Rubric V2 and do not predict impressions, reach, likes, comments, or virality. These V2 scores are not directly comparable with V1 scores.",
    "",
    "See the matching JSON report for privacy-safe per-attempt detail. Draft text and provider response bodies are not stored.",
    "",
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function format(value: number | null): string {
  return value === null ? "pending" : Number(value.toFixed(3)).toString();
}

function formatPercent(value: number | null): string {
  return value === null ? "pending" : `${(value * 100).toFixed(1)}%`;
}
