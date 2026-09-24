import type {
  BenchmarkAttempt,
  BenchmarkProvider,
  HumanLabelFile,
  TokenPrices,
} from "./benchmark.types";
import type { DatasetManifest } from "./dataset";
import { summarizeBenchmark } from "./metrics";

export interface BenchmarkReport {
  readonly conditions: {
    readonly runId: string;
    readonly mode: "preflight" | "run";
    readonly createdAt: string;
    readonly completedAt: string;
    readonly dataset: DatasetManifest;
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
    readonly completedAttempts: number;
    readonly priceAssumptions: Partial<Record<BenchmarkProvider, TokenPrices>>;
    readonly maximumEstimatedUsd: number;
    readonly providerSpendCapConfirmed: boolean;
  };
  readonly summary: ReturnType<typeof summarizeBenchmark>;
  readonly incompleteAttemptKeys: readonly string[];
}

export function createBenchmarkReport(
  manifest: Omit<
    BenchmarkReport["conditions"],
    "completedAt" | "completedAttempts"
  >,
  attempts: readonly BenchmarkAttempt[],
  scheduledKeys: readonly string[],
  labels: HumanLabelFile | null,
  completedAt = new Date().toISOString(),
): BenchmarkReport {
  const completed = new Set(attempts.map((attempt) => attempt.key));
  return {
    conditions: {
      ...manifest,
      completedAt,
      completedAttempts: attempts.length,
    },
    summary: summarizeBenchmark(attempts, labels, manifest.priceAssumptions),
    incompleteAttemptKeys: scheduledKeys.filter((key) => !completed.has(key)),
  };
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const { conditions, summary } = report;
  const rows = (["jev", "openai-llm"] as const).map((provider) => {
    const entry = summary.providers[provider];
    return `| ${provider} | ${entry.attempts} | ${entry.successes} | ${format(entry.meanOverallScore)} | ${format(entry.latencyMs.evaluatorP50)} | ${format(entry.latencyMs.evaluatorP95)} | ${format(entry.repeatability.exactRate)} | ${format(entry.humanAgreement?.exactRate ?? null)} | ${format(entry.cost.estimatedTotalUsd)} | ${format(entry.cost.estimatedPerSuccessUsd)} |`;
  });
  return [
    "# PostLens evaluator benchmark",
    "",
    `Run: ${conditions.runId} (${conditions.mode}); created ${conditions.createdAt}; completed ${conditions.completedAt}`,
    `Dataset: ${conditions.dataset.version}, SHA-256 ${conditions.dataset.hash}, ${conditions.dataset.fixtureCount} fixtures`,
    `Rubric: ${conditions.dataset.rubric.id} ${conditions.dataset.rubric.version}`,
    `Protocol: ${conditions.protocolHash}; code revision: ${conditions.codeRevision}`,
    `Command: ${conditions.command}; seed: ${conditions.seed}; timeout: ${conditions.timeoutMs} ms; concurrency: ${conditions.concurrency}; LLM output budget: ${conditions.llmOutputTokenBudget} tokens; LLM temperature: ${conditions.llmTemperature}`,
    `Jev SDK: ${conditions.jevSdkVersion}; LLM prompt/schema: ${conditions.llmPromptVersion}/${conditions.llmSchemaVersion}`,
    `Models: Jev ${conditions.models.jev}; LLM ${conditions.models["openai-llm"]}`,
    `Attempts: ${conditions.completedAttempts}/${conditions.scheduledAttempts}; retries: ${conditions.retries}; incomplete: ${report.incompleteAttemptKeys.length}`,
    `Local estimated spend threshold: USD ${conditions.maximumEstimatedUsd}; provider-side hard cap confirmed: ${conditions.providerSpendCapConfirmed}. Local cost estimates are not a hard cap and failed requests may still be billed.`,
    "",
    "| Provider | Attempts | Successes | Mean score | Evaluator p50 ms | Evaluator p95 ms | Repeat exact | Human exact | Total estimated USD | Per success USD |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    `Paired successful attempts: ${summary.pairedSuccessfulAttempts}; mean score difference (LLM minus Jev): ${format(summary.pairedMeanScoreDifferenceLlmMinusJev)}`,
    `Human labels: ${summary.humanLabelsPending ? "pending or incomplete" : "complete for the frozen subset"}. Human labels are judgments, not perfect ground truth.`,
    `Inter-rater exact agreement: ${format(summary.interRaterAgreement?.exactRate ?? null)} across ${summary.interRaterAgreement?.pairedFixtureCount ?? 0} fixtures.`,
    "",
    "## Largest paired score differences",
    "",
    ...summary.pairedComparisons
      .toSorted(
        (a, b) =>
          Math.abs(b.scoreDifferenceLlmMinusJev) -
            Math.abs(a.scoreDifferenceLlmMinusJev) ||
          a.fixtureId.localeCompare(b.fixtureId) ||
          a.repetition - b.repetition,
      )
      .slice(0, 10)
      .map(
        (item) =>
          `- ${item.fixtureId}, repetition ${item.repetition}: LLM minus Jev ${item.scoreDifferenceLlmMinusJev} points; dimension differences ${JSON.stringify(item.levelDifferencesLlmMinusJev)}.`,
      ),
    ...(summary.pairedComparisons.length ? [] : ["No successful pairs yet."]),
    "",
    "## Limitations",
    "",
    "This dataset contains project-owned synthetic posts. Repeated comparisons share fixtures and are not independent posts. Provider failures remain in the attempt denominator. Missing token usage or prices make total cost unavailable. A rubric score does not predict LinkedIn reach or engagement.",
    "",
    "## Failure counts and coverage",
    "",
    ...(["jev", "openai-llm"] as const).map((provider) => {
      const item = summary.providers[provider];
      return `- ${provider}: failures ${JSON.stringify(item.failures)}; latency samples ${item.latencyMs.successfulSampleCount} successful, ${item.latencyMs.failedSampleCount} failed; repeatability fixtures ${item.repeatability.fixtureCount}; human-labeled fixtures with results ${item.humanAgreement?.coveredFixtureCount ?? 0}/${item.humanAgreement?.labeledFixtureCount ?? 24}; recorded tokens ${item.cost.inputTokens} input, ${item.cost.outputTokens} output; missing usage ${item.cost.missingUsageCount}.`;
    }),
    "",
    "Refer to report.json, manifest.json, and attempts.jsonl in the same run directory for complete conditions, per-dimension metrics, and failure records.",
    "",
  ].join("\n");
}

function format(value: number | null): string {
  return value === null ? "pending" : Number(value.toFixed(4)).toString();
}
