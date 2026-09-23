import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scorePost } from "../src/features/evaluation/domain/scoring";
import {
  type JevExperimentRun,
  summarizeJevExperiment,
} from "../src/features/evaluation/experiments/jev-experiment";
import { JEV_EVALUATION_FIXTURES } from "../src/features/evaluation/fixtures/jev-fixtures";
import {
  JevAdapterError,
  type JevEvaluationDiagnostics,
  type JevExplanationMode,
} from "../src/features/evaluation/infrastructure/jev";
import { createJevRuntime, TYPESAFE_SDK_VERSION } from "./jev-runtime";

const EXPERIMENT_MODES: readonly JevExplanationMode[] = [
  "rubric-level",
  "reason-code",
];

async function main(): Promise<void> {
  const repeatCount = parseRepeatCount(process.env.JEV_REPEAT_COUNT);
  const runs: JevExperimentRun[] = [];
  const startedAt = new Date();

  for (const explanationMode of EXPERIMENT_MODES) {
    let latestDiagnostics: JevEvaluationDiagnostics | undefined;
    const { evaluator, model } = createJevRuntime({
      explanationMode,
      onDiagnostics: (event) => {
        latestDiagnostics = event;
      },
    });

    for (const fixture of JEV_EVALUATION_FIXTURES) {
      for (let repetition = 1; repetition <= repeatCount; repetition += 1) {
        latestDiagnostics = undefined;
        const recordedAt = new Date().toISOString();

        try {
          const judgments = await evaluator.evaluate({
            content: fixture.content,
          });

          if (latestDiagnostics === undefined) {
            throw new Error("Jev diagnostics were not emitted.");
          }

          runs.push({
            status: "success",
            fixtureId: fixture.id,
            category: fixture.category,
            repetition,
            explanationMode,
            recordedAt,
            evaluation: scorePost(judgments),
            diagnostics: latestDiagnostics,
          });
        } catch (error) {
          runs.push({
            status: "failure",
            fixtureId: fixture.id,
            category: fixture.category,
            repetition,
            explanationMode,
            recordedAt,
            errorKind:
              error instanceof JevAdapterError ? error.kind : "unexpected",
          });
        }

        console.log(
          `${model} ${explanationMode} ${fixture.id} ${repetition}/${repeatCount}`,
        );
      }
    }
  }

  const report = {
    conditions: {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      requestedModel:
        process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest",
      sdkVersion: TYPESAFE_SDK_VERSION,
      rubric: { id: "postlens-linkedin", version: "1.0.0" },
      fixtureCount: JEV_EVALUATION_FIXTURES.length,
      repeatCount,
      explanationModes: EXPERIMENT_MODES,
      retries: 0,
    },
    summary: summarizeJevExperiment(runs),
    runs,
  };
  const directory = resolve("content/experiments");
  const filename = `jev-phase3-${startedAt.toISOString().replaceAll(":", "-")}.json`;
  const path = resolve(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ path, summary: report.summary }, null, 2));
}

function parseRepeatCount(value: string | undefined): number {
  const parsed = Number(value ?? "5");

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error("JEV_REPEAT_COUNT must be an integer from 1 to 20.");
  }

  return parsed;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Jev repeatability experiment failed unexpectedly.",
  );
  process.exitCode = 1;
});
