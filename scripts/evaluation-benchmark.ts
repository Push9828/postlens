import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  type PostEvaluator,
  PostEvaluatorError,
} from "../src/features/evaluation/application/post-evaluator";
import { parseSavedAttempts } from "../src/features/evaluation/benchmark/attempts";
import type {
  BenchmarkAttempt,
  BenchmarkProvider,
  HumanLabelFile,
  TokenPrices,
} from "../src/features/evaluation/benchmark/benchmark.types";
import { createDatasetManifest } from "../src/features/evaluation/benchmark/dataset";
import { parseHumanLabels } from "../src/features/evaluation/benchmark/labels";
import {
  createBenchmarkReport,
  renderBenchmarkMarkdown,
} from "../src/features/evaluation/benchmark/report";
import {
  createSchedule,
  remainingSchedule,
  type ScheduledAttempt,
} from "../src/features/evaluation/benchmark/schedule";
import { EVALUATION_DIMENSIONS } from "../src/features/evaluation/domain/evaluation.types";
import {
  ScoringInputError,
  scorePost,
} from "../src/features/evaluation/domain/scoring";
import {
  type JevEvaluationDiagnostics,
  JevPostEvaluator,
  TypeSafeJevClient,
} from "../src/features/evaluation/infrastructure/jev";
import {
  LLM_EVALUATOR_OUTPUT_TOKEN_BUDGET,
  LLM_EVALUATOR_PROMPT_VERSION,
  LLM_EVALUATOR_SCHEMA_VERSION,
  LLM_EVALUATOR_TEMPERATURE,
  type LLMEvaluationDiagnostics,
  LLMPostEvaluator,
} from "../src/features/evaluation/infrastructure/llm/llm-post-evaluator";
import { TYPESAFE_SDK_VERSION } from "./jev-runtime";

const EXPERIMENT_ROOT = resolve("content/experiments");
const DATASET = createDatasetManifest();
const SEED = 8_2026;
const TIMEOUT_MS = 15_000;
const MODELS = {
  jev: process.env.BENCHMARK_JEV_MODEL?.trim() || "jev-1.13.0",
  "openai-llm":
    process.env.BENCHMARK_LLM_MODEL?.trim() || "gpt-4o-mini-2024-07-18",
} as const;

interface RunManifest {
  readonly runId: string;
  readonly mode: "preflight" | "run";
  readonly createdAt: string;
  readonly dataset: typeof DATASET;
  readonly protocolHash: string;
  readonly codeRevision: string;
  readonly command: string;
  readonly seed: number;
  readonly timeoutMs: number;
  readonly concurrency: 1;
  readonly llmOutputTokenBudget: number;
  readonly llmTemperature: string;
  readonly jevSdkVersion: string;
  readonly llmPromptVersion: string;
  readonly llmSchemaVersion: string;
  readonly models: Readonly<Record<BenchmarkProvider, string>>;
  readonly retries: 0;
  readonly scheduledAttempts: number;
  readonly scheduledKeys: readonly string[];
  readonly priceAssumptions: Partial<Record<BenchmarkProvider, TokenPrices>>;
  readonly maximumEstimatedUsd: number;
  readonly providerSpendCapConfirmed: true;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "validate";
  if (!["validate", "dry-run", "preflight", "run"].includes(command))
    throw new Error("Use validate, dry-run, preflight, or run.");
  if (command === "validate") {
    console.log(JSON.stringify(DATASET, null, 2));
    return;
  }
  const mode = command === "preflight" ? "preflight" : "run";
  const schedule = createSchedule(mode, SEED);
  const prices = loadPrices();
  const codeRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const protocolHash = hash(
    JSON.stringify({
      datasetHash: DATASET.hash,
      rubric: DATASET.rubric,
      models: MODELS,
      seed: SEED,
      timeoutMs: TIMEOUT_MS,
      promptVersion: LLM_EVALUATOR_PROMPT_VERSION,
      schemaVersion: LLM_EVALUATOR_SCHEMA_VERSION,
      llmOutputTokenBudget: LLM_EVALUATOR_OUTPUT_TOKEN_BUDGET,
      llmTemperature: LLM_EVALUATOR_TEMPERATURE,
      jevExplanationMode: "reason-code",
      retries: 0,
    }),
  );
  const estimatedReserveUsd = estimateReserveCost(schedule, prices);
  if (command === "dry-run") {
    console.log(
      JSON.stringify(
        {
          dataset: DATASET,
          protocolHash,
          codeRevision,
          models: MODELS,
          scheduledAttempts: schedule.length,
          selectedFixtureIds: DATASET.fixtures.map((fixture) => fixture.id),
          scheduleHash: hash(JSON.stringify(schedule.map((item) => item.key))),
          outputRoot: EXPERIMENT_ROOT,
          outputDirectoryPattern: `benchmark-${mode}-<UTC timestamp>`,
          priceAssumptions: prices,
          estimatedReserveUsd,
          liveCredentialsPresent: Boolean(
            process.env.TYPESAFE_API_KEY && process.env.OPENAI_API_KEY,
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
  )
    throw new Error(
      "Commit the benchmark implementation before a live run so the code revision is reproducible.",
    );
  const maxAttempts = parsePositiveInteger(
    process.env.BENCHMARK_MAX_ATTEMPTS,
    "BENCHMARK_MAX_ATTEMPTS",
  );
  const maximumEstimatedUsd = parsePositiveNumber(
    process.env.BENCHMARK_MAX_USD,
    "BENCHMARK_MAX_USD",
  );
  if (schedule.length > maxAttempts)
    throw new Error("Planned attempts exceed BENCHMARK_MAX_ATTEMPTS.");
  if (estimatedReserveUsd === null || estimatedReserveUsd > maximumEstimatedUsd)
    throw new Error(
      "Set documented provider prices and a sufficient BENCHMARK_MAX_USD before live calls.",
    );
  if (process.env.BENCHMARK_PROVIDER_SPEND_CAP_CONFIRMED !== "true")
    throw new Error(
      "Confirm provider-side hard spend caps before live calls with BENCHMARK_PROVIDER_SPEND_CAP_CONFIRMED=true; local token estimates cannot enforce a hard cap.",
    );
  const jevKey = process.env.TYPESAFE_API_KEY?.trim();
  const llmKey = process.env.OPENAI_API_KEY?.trim();
  if (!jevKey || !llmKey)
    throw new Error(
      "Both TYPESAFE_API_KEY and OPENAI_API_KEY are required for a live benchmark.",
    );
  if (command === "run")
    await verifyPreflight(
      argumentValue("--preflight="),
      protocolHash,
      codeRevision,
    );

  const resumePath = argumentValue("--resume=");
  const createdAt = new Date().toISOString();
  const runId = `${mode}-${createdAt.replaceAll(":", "-")}`;
  const directory = resumePath
    ? privatePath(resumePath)
    : resolve(EXPERIMENT_ROOT, `benchmark-${runId}`);
  const manifestPath = resolve(directory, "manifest.json");
  const attemptsPath = resolve(directory, "attempts.jsonl");
  const manifest: RunManifest = resumePath
    ? (JSON.parse(await readFile(manifestPath, "utf8")) as RunManifest)
    : {
        runId,
        mode,
        createdAt,
        dataset: DATASET,
        protocolHash,
        codeRevision,
        command: `pnpm benchmark ${command}`,
        seed: SEED,
        timeoutMs: TIMEOUT_MS,
        concurrency: 1,
        llmOutputTokenBudget: LLM_EVALUATOR_OUTPUT_TOKEN_BUDGET,
        llmTemperature: LLM_EVALUATOR_TEMPERATURE,
        jevSdkVersion: TYPESAFE_SDK_VERSION,
        llmPromptVersion: LLM_EVALUATOR_PROMPT_VERSION,
        llmSchemaVersion: LLM_EVALUATOR_SCHEMA_VERSION,
        models: MODELS,
        retries: 0,
        scheduledAttempts: schedule.length,
        scheduledKeys: schedule.map((item) => item.key),
        priceAssumptions: prices,
        maximumEstimatedUsd,
        providerSpendCapConfirmed: true,
      };
  if (
    manifest.protocolHash !== protocolHash ||
    manifest.codeRevision !== codeRevision ||
    manifest.dataset.hash !== DATASET.hash ||
    manifest.mode !== mode ||
    manifest.maximumEstimatedUsd !== maximumEstimatedUsd ||
    manifest.providerSpendCapConfirmed !== true ||
    JSON.stringify(manifest.priceAssumptions) !== JSON.stringify(prices) ||
    JSON.stringify(manifest.scheduledKeys) !==
      JSON.stringify(schedule.map((item) => item.key))
  )
    throw new Error(
      "The resume manifest does not match the frozen protocol and code revision.",
    );
  if (!resumePath) {
    await mkdir(directory, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  }
  const attempts = await readAttempts(attemptsPath);
  const pending = remainingSchedule(schedule, attempts);
  const labels = await readLabels(argumentValue("--labels="));
  let jevDiagnostics: JevEvaluationDiagnostics | undefined;
  let llmDiagnostics: LLMEvaluationDiagnostics | undefined;
  const evaluators: Readonly<Record<BenchmarkProvider, PostEvaluator>> = {
    jev: new JevPostEvaluator({
      client: new TypeSafeJevClient({
        apiKey: jevKey,
        model: MODELS.jev,
        timeoutMs: TIMEOUT_MS,
        maxRetries: 0,
      }),
      requestedModel: MODELS.jev,
      explanationMode: "reason-code",
      onDiagnostics: (value) => {
        jevDiagnostics = value;
      },
    }),
    "openai-llm": new LLMPostEvaluator({
      apiKey: llmKey,
      model: MODELS["openai-llm"],
      timeoutMs: TIMEOUT_MS,
      onDiagnostics: (value) => {
        llmDiagnostics = value;
      },
    }),
  };
  try {
    for (const item of pending) {
      const spent = observedCost(attempts, prices);
      const reserve = estimateReserveCost([item], prices);
      if (
        spent === null ||
        reserve === null ||
        spent + reserve > maximumEstimatedUsd
      )
        throw new Error(
          "Estimated spend threshold reached; partial run preserved. Provider-side caps remain the hard limit.",
        );
      jevDiagnostics = undefined;
      llmDiagnostics = undefined;
      const attempt = await evaluateAttempt(
        item,
        evaluators[item.provider],
        () => (item.provider === "jev" ? jevDiagnostics : llmDiagnostics),
      );
      attempts.push(attempt);
      await appendFile(attemptsPath, `${JSON.stringify(attempt)}\n`, "utf8");
      console.log(
        `${item.order}/${schedule.length} ${item.provider} ${item.fixture.id} ${attempt.status}${attempt.status === "failure" ? ` ${attempt.errorKind}` : ""}`,
      );
    }
  } finally {
    const report = createBenchmarkReport(
      manifest,
      attempts,
      schedule.map((item) => item.key),
      labels,
    );
    await writeFile(
      resolve(directory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      resolve(directory, "report.md"),
      renderBenchmarkMarkdown(report),
      "utf8",
    );
    console.log(
      JSON.stringify({
        directory,
        completedAttempts: attempts.length,
        scheduledAttempts: schedule.length,
        humanLabelsPending: report.summary.humanLabelsPending,
      }),
    );
  }
}

async function evaluateAttempt(
  item: ScheduledAttempt,
  evaluator: PostEvaluator,
  diagnostics: () =>
    | JevEvaluationDiagnostics
    | LLMEvaluationDiagnostics
    | undefined,
): Promise<BenchmarkAttempt> {
  const startedAt = performance.now();
  const recordedAt = new Date().toISOString();
  let evaluatorLatencyMs: number | null = null;
  const base = {
    key: item.key,
    fixtureId: item.fixture.id,
    category: item.fixture.category,
    provider: item.provider,
    repetition: item.repetition,
    order: item.order,
    recordedAt,
    requestedModel: MODELS[item.provider],
  };
  try {
    const judgments = await evaluator.evaluate({
      content: item.fixture.content,
    });
    evaluatorLatencyMs = Math.max(0, performance.now() - startedAt);
    const evaluation = scorePost(judgments);
    const event = diagnostics();
    if (!event) throw new Error("Provider diagnostics were not emitted.");
    const inputTokens =
      item.provider === "jev"
        ? (event as JevEvaluationDiagnostics).usage.inputTokens
        : (event as LLMEvaluationDiagnostics).inputTokens;
    const outputTokens =
      item.provider === "jev"
        ? (event as JevEvaluationDiagnostics).usage.outputTokens
        : (event as LLMEvaluationDiagnostics).outputTokens;
    return {
      ...base,
      status: "success",
      totalLatencyMs: Math.max(0, performance.now() - startedAt),
      evaluatorLatencyMs: event.latencyMs,
      resolvedModel: event.resolvedModel,
      inputTokens,
      outputTokens,
      levels: Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          dimension,
          evaluation.dimensions[dimension].level,
        ]),
      ) as Extract<BenchmarkAttempt, { status: "success" }>["levels"],
      overallScore: evaluation.overallScore,
      contentType: evaluation.contentType,
    };
  } catch (error) {
    const errorKind =
      error instanceof PostEvaluatorError
        ? error.kind
        : error instanceof ScoringInputError
          ? "domain-validation"
          : "unexpected";
    return {
      ...base,
      status: "failure",
      totalLatencyMs: Math.max(0, performance.now() - startedAt),
      evaluatorLatencyMs,
      errorKind,
    };
  }
}

function loadPrices(): Partial<Record<BenchmarkProvider, TokenPrices>> {
  const effectiveDate = process.env.BENCHMARK_PRICE_DATE?.trim();
  if (!effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return {};
  const prices: Partial<Record<BenchmarkProvider, TokenPrices>> = {};
  for (const [provider, prefix] of [
    ["jev", "JEV"],
    ["openai-llm", "LLM"],
  ] as const) {
    const source = process.env[`BENCHMARK_${prefix}_PRICE_SOURCE`]?.trim();
    const input = Number(
      process.env[`BENCHMARK_${prefix}_INPUT_USD_PER_MILLION`],
    );
    const output = Number(
      process.env[`BENCHMARK_${prefix}_OUTPUT_USD_PER_MILLION`],
    );
    if (
      source &&
      Number.isFinite(input) &&
      input > 0 &&
      Number.isFinite(output) &&
      output > 0
    )
      prices[provider] = {
        currency: "USD",
        source,
        effectiveDate,
        inputUsdPerMillion: input,
        outputUsdPerMillion: output,
      };
  }
  return prices;
}

function estimateReserveCost(
  schedule: readonly ScheduledAttempt[],
  prices: Partial<Record<BenchmarkProvider, TokenPrices>>,
): number | null {
  let total = 0;
  for (const item of schedule) {
    const price = prices[item.provider];
    if (!price) return null;
    const estimatedInputTokens = 6_000;
    const estimatedOutputTokens =
      item.provider === "jev" ? 2_000 : LLM_EVALUATOR_OUTPUT_TOKEN_BUDGET;
    total +=
      (estimatedInputTokens * price.inputUsdPerMillion +
        estimatedOutputTokens * price.outputUsdPerMillion) /
      1_000_000;
  }
  return total;
}

function observedCost(
  attempts: readonly BenchmarkAttempt[],
  prices: Partial<Record<BenchmarkProvider, TokenPrices>>,
): number | null {
  let total = 0;
  for (const attempt of attempts) {
    const price = prices[attempt.provider];
    if (!price) return null;
    if (
      attempt.status === "success" &&
      attempt.inputTokens !== null &&
      attempt.outputTokens !== null
    )
      total +=
        (attempt.inputTokens * price.inputUsdPerMillion +
          attempt.outputTokens * price.outputUsdPerMillion) /
        1_000_000;
  }
  return total;
}

async function readAttempts(path: string): Promise<BenchmarkAttempt[]> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseSavedAttempts(source);
}

async function readLabels(
  value: string | undefined,
): Promise<HumanLabelFile | null> {
  if (!value) return null;
  return parseHumanLabels(
    JSON.parse(await readFile(privatePath(value), "utf8")),
    DATASET,
  );
}

async function verifyPreflight(
  value: string | undefined,
  protocolHash: string,
  codeRevision: string,
): Promise<void> {
  if (!value)
    throw new Error(
      "A successful --preflight=PATH is required before the full run.",
    );
  const directory = privatePath(value);
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  ) as RunManifest;
  const attempts = await readAttempts(resolve(directory, "attempts.jsonl"));
  if (
    manifest.mode !== "preflight" ||
    manifest.protocolHash !== protocolHash ||
    manifest.codeRevision !== codeRevision ||
    attempts.length !== 10 ||
    remainingSchedule(createSchedule("preflight", SEED), attempts).length !==
      0 ||
    attempts.some((attempt) => attempt.status !== "success")
  )
    throw new Error(
      "The preflight is incomplete, failed, or uses a different protocol revision.",
    );
}

function privatePath(value: string): string {
  const path = resolve(value);
  if (path !== EXPERIMENT_ROOT && !path.startsWith(`${EXPERIMENT_ROOT}${sep}`))
    throw new Error("Experiment paths must be inside content/experiments.");
  return path;
}

function argumentValue(prefix: string): string | undefined {
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}
function parsePositiveInteger(value: string | undefined, name: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error(`${name} must be a positive integer.`);
  return number;
}
function parsePositiveNumber(value: string | undefined, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new Error(`${name} must be positive.`);
  return number;
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Benchmark failed unexpectedly.",
  );
  process.exitCode = 1;
});
