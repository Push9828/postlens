import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type Question, TypeSafeClient } from "@typesafe-ai/sdk";
import { EVALUATION_DIMENSIONS } from "../src/features/evaluation/domain/evaluation.types";
import {
  type JevBatchingMeasurement,
  summarizeJevBatchingExperiment,
} from "../src/features/evaluation/experiments/jev-experiment";
import { JEV_EVALUATION_FIXTURES } from "../src/features/evaluation/fixtures/jev-fixtures";
import { getJevScoreKey } from "../src/features/evaluation/infrastructure/jev/jev.types";
import { buildJevQuestions } from "../src/features/evaluation/infrastructure/jev/typesafe-jev-client";
import { TYPESAFE_SDK_VERSION } from "./jev-runtime";

interface BatchingResult extends JevBatchingMeasurement {
  readonly fixtureId: string;
  readonly repetition: number;
  readonly resolvedModels: readonly string[];
}

async function main(): Promise<void> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TYPESAFE_API_KEY is required for the batching experiment.",
    );
  }

  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest";
  const startedAt = new Date();
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: model,
    logLevel: "off",
    retry: { maxRetries: 0 },
  });
  const questions = buildJevQuestions("rubric-level");
  const scoreQuestions = Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => {
      const key = getJevScoreKey(dimension);
      return [key, questions[key]];
    }),
  ) as Record<string, Question>;
  const results: BatchingResult[] = [];
  const repetitions = 3;

  for (const fixture of JEV_EVALUATION_FIXTURES.slice(0, 3)) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const state = { platform: "LinkedIn", draft: fixture.content };
      const batchStartedAt = performance.now();
      const batch = await client.systemOne(
        { state, questions: scoreQuestions, model },
        { retry: { maxRetries: 0 } },
      );
      results.push({
        fixtureId: fixture.id,
        repetition,
        mode: "batched",
        latencyMs: performance.now() - batchStartedAt,
        inputTokens: batch.usage.input_tokens,
        outputTokens: batch.usage.output_tokens,
        resolvedModels: [batch.model],
      });

      const separateStartedAt = performance.now();
      const separate = await Promise.all(
        Object.entries(scoreQuestions).map(([key, question]) =>
          client.systemOne(
            { state, questions: { [key]: question }, model },
            { retry: { maxRetries: 0 } },
          ),
        ),
      );
      results.push({
        fixtureId: fixture.id,
        repetition,
        mode: "parallel-separate",
        latencyMs: performance.now() - separateStartedAt,
        inputTokens: separate.reduce(
          (total, result) => total + result.usage.input_tokens,
          0,
        ),
        outputTokens: separate.reduce(
          (total, result) => total + result.usage.output_tokens,
          0,
        ),
        resolvedModels: separate.map((result) => result.model),
      });
    }
  }

  const directory = resolve("content/experiments");
  const path = resolve(
    directory,
    `jev-batching-${startedAt.toISOString().replaceAll(":", "-")}.json`,
  );
  const report = {
    conditions: {
      date: startedAt.toISOString(),
      requestedModel: model,
      sdkVersion: TYPESAFE_SDK_VERSION,
      retries: 0,
      separateMode: "parallel",
      fixtureCount: 3,
      repetitions,
    },
    summary: summarizeJevBatchingExperiment(results),
    results,
  };

  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ path, summary: report.summary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Jev batching experiment failed unexpectedly.",
  );
  process.exitCode = 1;
});
