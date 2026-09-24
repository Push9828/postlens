import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BENCHMARK_FIXTURES } from "../src/features/evaluation/fixtures/benchmark-dataset";
import {
  createV2BenchmarkConditions,
  createV2BenchmarkReport,
  renderV2BenchmarkMarkdown,
  type V2BenchmarkFixture,
} from "../src/features/evaluation/v2/benchmark/report";
import type { V2BenchmarkAttempt } from "../src/features/evaluation/v2/benchmark/types";
import type { JevV2Diagnostics } from "../src/features/evaluation/v2/jev/jev.types";
import { V2JevEvaluatorError } from "../src/features/evaluation/v2/jev/jev-error";
import { JevV2PostEvaluator } from "../src/features/evaluation/v2/jev/jev-post-evaluator";
import { TypeSafeJevV2Client } from "../src/features/evaluation/v2/jev/typesafe-jev-client";
import {
  calculatePostScores,
  resolveWeightProfile,
  scoreRawDimensions,
} from "../src/features/evaluation/v2/scoring";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "../src/features/evaluation/v2/types";

const SELECTED_FIXTURE_IDS = [
  "educational-index-plan",
  "educational-list-only",
  "opinion-code-review-risk",
  "opinion-question-only",
  "story-incident-ownership",
  "story-vague-resilience",
  "case-study-queue-limit",
  "case-study-missing-baseline",
  "edge-quiet-reflection",
  "career-promotion-tradeoff",
  "announcement-clear-release",
  "announcement-hype",
  "build-public-failed-test",
  "build-public-vanity",
  "career-mentor-question",
  "other-engagement-bait-poll",
] as const;
const REPETITIONS = 2;
const EXPERIMENT_ROOT = join(process.cwd(), "content", "experiments");

async function main(): Promise<void> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey)
    throw new Error("TYPESAFE_API_KEY is required for a live V2 benchmark.");
  const requestedModel =
    process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest";
  const timeoutMs = parsePositiveInteger(
    process.env.TYPESAFE_TIMEOUT_MS,
    10_000,
  );
  const fixtures = SELECTED_FIXTURE_IDS.map((id) => {
    const fixture = BENCHMARK_FIXTURES.find((candidate) => candidate.id === id);
    if (!fixture) throw new Error(`V2 benchmark fixture is missing: ${id}`);
    return fixture satisfies V2BenchmarkFixture;
  });
  const started = new Date();
  const headRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const trackedChanges = execFileSync(
    "git",
    [
      "diff",
      "--binary",
      "HEAD",
      "--",
      "package.json",
      "pnpm-lock.yaml",
      "scripts",
      "src",
    ],
    { encoding: "utf8" },
  );
  const untrackedPaths = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "scripts", "src"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .toSorted();
  const untrackedSources = await Promise.all(
    untrackedPaths.map(
      async (path) => `${path}\n${await readFile(path, "utf8")}`,
    ),
  );
  const sourceFingerprint = sha256(
    `${trackedChanges}\n${untrackedSources.join("\n")}`,
  );
  const conditions = createV2BenchmarkConditions(fixtures, {
    datasetVersion: "project-synthetic-v1.0.0-v2-sample-1",
    createdAt: started.toISOString(),
    codeRevision: `${headRevision}+worktree.${sourceFingerprint.slice(0, 12)}`,
    requestedModel,
    timeoutMs,
    fixtureIds: SELECTED_FIXTURE_IDS,
    repetitions: REPETITIONS,
  });
  const attempts: V2BenchmarkAttempt[] = [];
  const diagnosticsState: { current: JevV2Diagnostics | undefined } = {
    current: undefined,
  };
  const evaluator = new JevV2PostEvaluator({
    client: new TypeSafeJevV2Client({
      apiKey,
      model: requestedModel,
      timeoutMs,
      maxRetries: 0,
    }),
    requestedModel,
    onDiagnostics: (value) => {
      diagnosticsState.current = value;
    },
  });
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  for (const fixtureId of SELECTED_FIXTURE_IDS) {
    const fixture = fixtureById.get(fixtureId);
    if (!fixture)
      throw new Error(`V2 benchmark fixture is missing: ${fixtureId}`);
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      const startedAt = performance.now();
      const base = {
        key: `${fixture.id}:${repetition}`,
        fixtureId: fixture.id,
        category: fixture.category,
        repetition,
        recordedAt: new Date().toISOString(),
        characterCount: Array.from(fixture.content).length,
        contentHash: sha256(fixture.content),
        requestedModel,
      };
      try {
        diagnosticsState.current = undefined;
        const judgments = await evaluator.evaluate(fixture.content);
        const dimensionScores = scoreRawDimensions(judgments.rawEvaluation);
        const resolvedProfile = resolveWeightProfile(judgments.classification);
        const scores = calculatePostScores(dimensionScores, resolvedProfile);
        const measured = readDiagnostics(diagnosticsState);
        const levels = Object.fromEntries(
          EVALUATION_DIMENSIONS.map((dimension) => [
            dimension,
            judgments.rawEvaluation.dimensions[dimension].level,
          ]),
        ) as Record<EvaluationDimension, EvaluationLevel>;
        attempts.push({
          ...base,
          status: "success",
          resolvedModel: measured?.resolvedModel,
          latencyMs:
            measured?.latencyMs ?? Math.max(0, performance.now() - startedAt),
          inputTokens: measured?.usage.inputTokens,
          outputTokens: measured?.usage.outputTokens,
          classification: judgments.classification,
          resolvedProfile,
          levels,
          dimensionScores,
          scores,
        });
        console.info(`${fixture.id} repetition ${repetition}: success`);
      } catch (error) {
        attempts.push({
          ...base,
          status: "failure",
          latencyMs: Math.max(0, performance.now() - startedAt),
          errorKind:
            error instanceof V2JevEvaluatorError ? error.kind : "unexpected",
        });
        console.info(`${fixture.id} repetition ${repetition}: failure`);
      }
    }
  }

  const report = createV2BenchmarkReport(
    conditions,
    attempts,
    new Date().toISOString(),
  );
  await mkdir(EXPERIMENT_ROOT, { recursive: true });
  const runName = `rubric-v2-benchmark-${started.toISOString().replaceAll(":", "-")}`;
  await Promise.all([
    writeFile(
      join(EXPERIMENT_ROOT, `${runName}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      join(EXPERIMENT_ROOT, `${runName}.md`),
      renderV2BenchmarkMarkdown(report),
      "utf8",
    ),
  ]);
  console.info(
    JSON.stringify(
      {
        output: `content/experiments/${runName}.md`,
        rubricVersion: report.conditions.rubricVersion,
        datasetHash: report.conditions.datasetHash,
        attempts: report.summary.attempts,
        successes: report.summary.successes,
        failures: report.summary.failures,
        meanContentQuality: report.summary.meanContentQuality,
        meanEngagementPotential: report.summary.meanEngagementPotential,
        primaryTypeExactRate: report.summary.repeatability.primaryTypeExactRate,
      },
      null,
      2,
    ),
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error("TYPESAFE_TIMEOUT_MS must be a positive integer.");
  return parsed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readDiagnostics(state: {
  readonly current: JevV2Diagnostics | undefined;
}): JevV2Diagnostics | undefined {
  return state.current;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "V2 benchmark failed.",
  );
  process.exitCode = 1;
});
